import type { FeedArea, FeedMode } from "@bored/shared";
import {
  defaultAreaForCity,
  eventEndAt,
  feedCityFromTimeZone,
  locationDefaultForArea,
  resolveEventCoords,
} from "@bored/shared";

export type WeatherView = "live" | "week" | "day";

export type WeatherHour = {
  time: string;
  temperatureF: number;
  code: number;
};

export type WeatherDay = {
  date: string;
  code: number;
  highF: number;
  lowF: number;
  sunrise: string | null;
  sunset: string | null;
};

export type WeatherSnapshot = {
  current: {
    time: string;
    temperatureF: number;
    code: number;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
};

/** One column in the Apple-style hourly strip. */
export type WeatherStripSlot = {
  key: string;
  /** Local ISO time used for ordering / “Now” detection. */
  time: string;
  kind: "hour" | "sunrise" | "sunset";
  /** Top label: “Now”, “1 PM”, or sunrise/sunset clock time. */
  label: string;
  /** Bottom line: temperature, or “Sunrise” / “Sunset”. */
  footer: string;
  temperatureF: number | null;
  code: number | null;
  emoji: string;
};

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const CACHE_MS = 5 * 60 * 1000;

const weatherCache = new Map<
  string,
  { at: number; data: WeatherSnapshot }
>();

function weatherCacheKey(lat: number, lng: number, timeZone: string): string {
  return `v2:${lat.toFixed(3)},${lng.toFixed(3)},${timeZone}`;
}

export async function fetchWeatherCached(
  lat: number,
  lng: number,
  timeZone: string,
): Promise<WeatherSnapshot> {
  const key = weatherCacheKey(lat, lng, timeZone);
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await fetchWeather(lat, lng, timeZone);
  weatherCache.set(key, { at: Date.now(), data });
  return data;
}

/** Which weather layout to show for the active feed mode / date selection. */
export function weatherViewForFeed(
  mode: FeedMode,
  selectedDate: string | null,
): WeatherView {
  if (mode === "for_you" || mode === "today") return "live";
  if (selectedDate) return "day";
  if (mode === "weekend" || mode === "date") return "week";
  return "live";
}

export function weatherCoordsForArea(area: FeedArea): {
  lat: number;
  lng: number;
} {
  const loc = locationDefaultForArea(area);
  return { lat: loc.lat, lng: loc.lng };
}

export function weatherCoordsForEvent(event: {
  lat?: number | string | null;
  lng?: number | string | null;
  timezone?: string | null;
  venueName?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
}): { lat: number; lng: number } | null {
  const resolved = resolveEventCoords({
    lat: event.lat,
    lng: event.lng,
    venueName: event.venueName,
    title: event.title,
    address: event.address,
    city: event.city,
    neighborhood: event.neighborhood,
  });
  if (resolved.lat != null && resolved.lng != null) {
    return { lat: resolved.lat, lng: resolved.lng };
  }
  const metro = feedCityFromTimeZone(event.timezone);
  if (metro) {
    const loc = locationDefaultForArea(defaultAreaForCity(metro));
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

function zonedHourKey(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`;
}

/** WMO weather interpretation codes → short label + emoji. */
export function weatherPresentation(code: number): {
  label: string;
  emoji: string;
} {
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code <= 3) return { label: "Cloudy", emoji: "⛅" };
  if (code <= 48) return { label: "Foggy", emoji: "🌫️" };
  if (code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 67) return { label: "Rain", emoji: "🌧️" };
  if (code <= 77) return { label: "Snow", emoji: "🌨️" };
  if (code <= 82) return { label: "Showers", emoji: "🌧️" };
  if (code <= 86) return { label: "Snow showers", emoji: "🌨️" };
  if (code <= 99) return { label: "Thunderstorms", emoji: "⛈️" };
  return { label: "Mixed", emoji: "🌤️" };
}

export function formatWeatherTemp(f: number): string {
  return `${f}°`;
}

export function formatWeatherTime(isoLocal: string): string {
  const timePart = isoLocal.split("T")[1];
  if (!timePart) return isoLocal;
  const [hourStr] = timePart.split(":");
  const hour = Number(hourStr);
  if (!Number.isFinite(hour)) return isoLocal;
  const h12 = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${h12} ${suffix}`;
}

/** Clock time with minutes — for sunrise / sunset. */
export function formatWeatherClock(isoLocal: string): string {
  const timePart = isoLocal.split("T")[1];
  if (!timePart) return isoLocal;
  const [hourStr, minuteStr] = timePart.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return isoLocal;
  const h12 = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Sortable local timestamp key (`YYYY-MM-DDTHH:mm`). */
function localTimeKey(isoLocal: string): string {
  return isoLocal.slice(0, 16);
}

/**
 * Build Apple Weather–style strip: hours + sunrise/sunset, first current hour → “Now”.
 */
export function buildWeatherStripSlots(
  hours: WeatherHour[],
  daily: WeatherDay[],
  timeZone: string,
  now: Date = new Date(),
): WeatherStripSlot[] {
  if (hours.length === 0) return [];

  const nowKey = zonedHourKey(now, timeZone);
  const startKey = localTimeKey(hours[0]!.time);
  const endKey = localTimeKey(hours[hours.length - 1]!.time);

  const slots: WeatherStripSlot[] = hours.map((h, i) => {
    const isCurrentHour = h.time.slice(0, 13) === nowKey;
    const showNow = isCurrentHour && i === 0;
    const code = h.code;
    return {
      key: `h-${h.time}`,
      time: h.time,
      kind: "hour" as const,
      label: showNow ? "Now" : formatWeatherTime(h.time),
      footer: formatWeatherTemp(h.temperatureF),
      temperatureF: h.temperatureF,
      code,
      emoji: weatherPresentation(code).emoji,
    };
  });

  const daysNeeded = new Set(hours.map((h) => h.time.slice(0, 10)));
  for (const day of daily) {
    if (!daysNeeded.has(day.date)) continue;
    for (const kind of ["sunrise", "sunset"] as const) {
      const iso = kind === "sunrise" ? day.sunrise : day.sunset;
      if (!iso) continue;
      const key = localTimeKey(iso);
      if (key < startKey || key > endKey) continue;
      const name = kind === "sunrise" ? "Sunrise" : "Sunset";
      slots.push({
        key: `${kind}-${iso}`,
        time: iso,
        kind,
        label: formatWeatherClock(iso),
        footer: name,
        temperatureF: null,
        code: null,
        emoji: kind === "sunrise" ? "🌅" : "🌇",
      });
    }
  }

  slots.sort((a, b) => localTimeKey(a.time).localeCompare(localTimeKey(b.time)));

  // Re-apply Now only on the first hour slot after sort
  let labeledNow = false;
  return slots.map((s) => {
    if (s.kind !== "hour") return s;
    const isCurrentHour = s.time.slice(0, 13) === nowKey;
    if (isCurrentHour && !labeledNow) {
      labeledNow = true;
      return { ...s, label: "Now" };
    }
    if (s.label === "Now") {
      return { ...s, label: formatWeatherTime(s.time) };
    }
    return s;
  });
}

type OpenMeteoResponse = {
  current?: {
    time: string;
    temperature_2m: number;
    weather_code: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise?: string[];
    sunset?: string[];
  };
};

export async function fetchWeather(
  lat: number,
  lng: number,
  timeZone: string,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,weather_code",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    forecast_days: "8",
    timezone: timeZone,
    temperature_unit: "fahrenheit",
  });

  const res = await fetch(`${OPEN_METEO}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Weather ${res.status}`);
  }

  const data = (await res.json()) as OpenMeteoResponse;
  const current = data.current;
  if (!current || !data.hourly || !data.daily) {
    throw new Error("Incomplete weather response");
  }

  return {
    current: {
      time: current.time,
      temperatureF: Math.round(current.temperature_2m),
      code: current.weather_code,
    },
    hourly: data.hourly.time.map((time, i) => ({
      time,
      temperatureF: Math.round(data.hourly!.temperature_2m[i] ?? 0),
      code: data.hourly!.weather_code[i] ?? 0,
    })),
    daily: data.daily.time.map((date, i) => ({
      date,
      code: data.daily!.weather_code[i] ?? 0,
      highF: Math.round(data.daily!.temperature_2m_max[i] ?? 0),
      lowF: Math.round(data.daily!.temperature_2m_min[i] ?? 0),
      sunrise: data.daily!.sunrise?.[i] ?? null,
      sunset: data.daily!.sunset?.[i] ?? null,
    })),
  };
}

/** Next N hours from the current moment in the feed timezone. */
export function upcomingHourly(
  hourly: WeatherHour[],
  timeZone: string,
  count = 12,
  now: Date = new Date(),
): WeatherHour[] {
  const nowKey = zonedHourKey(now, timeZone);
  const idx = hourly.findIndex((h) => h.time.slice(0, 13) >= nowKey);
  const start = idx >= 0 ? idx : 0;
  return hourly.slice(start, start + count);
}

/** Hourly slots for a calendar day; if that day is today, start from now. */
export function hourlyForDay(
  hourly: WeatherHour[],
  dateKey: string,
  timeZone: string,
  now: Date = new Date(),
): WeatherHour[] {
  const dayHours = hourly.filter((h) => h.time.slice(0, 10) === dateKey);
  const todayKey = zonedHourKey(now, timeZone).slice(0, 10);
  if (dateKey !== todayKey) return dayHours;
  const nowKey = zonedHourKey(now, timeZone);
  return dayHours.filter((h) => h.time.slice(0, 13) >= nowKey);
}

const MAX_EVENT_HOURLY = 36;

/** Hourly slots from event start through end (defaults to +3h when open-ended). */
export function hourlyInEventWindow(
  hourly: WeatherHour[],
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): WeatherHour[] {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return [];

  const end = eventEndAt(startsAt, endsAt);
  if (end.getTime() <= now.getTime()) return [];

  const windowStart = start.getTime() > now.getTime() ? start : now;
  const startKey = zonedHourKey(windowStart, timeZone);
  const endKey = zonedHourKey(end, timeZone);

  return hourly
    .filter((h) => {
      const key = h.time.slice(0, 13);
      return key >= startKey && key <= endKey;
    })
    .slice(0, MAX_EVENT_HOURLY);
}
