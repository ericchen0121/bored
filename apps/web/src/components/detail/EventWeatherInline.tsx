"use client";

import { useMemo } from "react";
import { HourlyWeatherStrip } from "@/components/HourlyWeatherStrip";
import { WeatherFadeIn } from "@/components/WeatherReveal";
import { useWeather } from "@/hooks/useWeather";
import {
  formatWeatherTemp,
  hourlyInEventWindow,
  weatherCoordsForEvent,
  weatherPresentation,
} from "@/lib/weather";

type Props = {
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  lat?: number | string | null;
  lng?: number | string | null;
  venueName?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  /** Short place label (neighborhood / city) shown next to current temp. */
  placeLabel?: string | null;
};

export function EventWeatherInline({
  startsAt,
  endsAt,
  timezone,
  lat,
  lng,
  venueName,
  title,
  address,
  city,
  neighborhood,
  placeLabel,
}: Props) {
  const coords = weatherCoordsForEvent({
    lat,
    lng,
    timezone,
    venueName,
    title,
    address,
    city,
    neighborhood,
  });
  const weather = useWeather(
    coords?.lat ?? Number.NaN,
    coords?.lng ?? Number.NaN,
    timezone,
  );

  const eventHourly = useMemo(() => {
    if (!weather) return [];
    return hourlyInEventWindow(weather.hourly, startsAt, endsAt, timezone);
  }, [weather, startsAt, endsAt, timezone]);

  if (!coords || !weather || eventHourly.length === 0) return null;

  const current = weatherPresentation(weather.current.code);
  const place = formatPlaceLabel(placeLabel);

  return (
    <WeatherFadeIn
      className="detail-body__weather"
      aria-label="Weather during event"
      delayMs={40}
    >
      <p className="detail-body__weather-now meta">
        <span aria-hidden>{current.emoji}</span> Now{" "}
        {formatWeatherTemp(weather.current.temperatureF)}
        {place ? (
          <span className="detail-body__weather-hint"> · {place}</span>
        ) : (
          <span className="detail-body__weather-hint"> · during event</span>
        )}
      </p>
      <HourlyWeatherStrip
        hours={eventHourly}
        daily={weather.daily}
        timeZone={timezone}
        label="Hourly forecast during event"
      />
    </WeatherFadeIn>
  );
}

function formatPlaceLabel(raw?: string | null): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (s.includes(" ")) return s;
  return s
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
