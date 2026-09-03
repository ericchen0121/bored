import { dayKey, fromZonedTime, zonedWeekday } from "./datetime";
import {
  CURATED_FOOD_DEALS,
  type CuratedFoodDeal,
  type FoodDealWeekday,
} from "./foodDeals";
import type { FeedCard } from "./schemas";
import {
  FEED_CITY_LABELS,
  FEED_TOPIC_EMOJI,
  metroFromArea,
  type FeedArea,
  type FeedCity,
  type FeedMode,
  type FeedTopic,
} from "./taxonomy";

export const HAPPY_HOURS_HUB_CARD_ID = "hub:happy_hours";
export const HAPPY_HOURS_HUB_SOURCE = "happy_hours_hub";

const MS_PER_DAY = 86400000;

/** Bar / cocktail Unsplash art for the HH hub promo — not city skyline heroes. */
const HAPPY_HOURS_HUB_IMAGES: Record<FeedCity, string> = {
  sf: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=960&h=720&q=82",
  chicago:
    "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=960&h=720&q=82",
  la: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=960&h=720&q=82",
};

function happyHoursHubImageUrl(city: FeedCity): string {
  return HAPPY_HOURS_HUB_IMAGES[city];
}

/** Fallback when a city has no curated HH rows for today’s weekday. */
const FALLBACK_WINDOW = {
  weekdays: [1, 2, 3, 4, 5] as FoodDealWeekday[],
  startHour: 15,
  startMinute: 0,
  endHour: 19,
  endMinute: 0,
};

export function isHappyHoursHubCard(
  card: Pick<FeedCard, "id"> | Pick<FeedCard, "id" | "source">,
): boolean {
  return (
    card.id === HAPPY_HOURS_HUB_CARD_ID ||
    ("source" in card && card.source === HAPPY_HOURS_HUB_SOURCE)
  );
}

function dealsForCity(city: FeedCity): CuratedFoodDeal[] {
  return CURATED_FOOD_DEALS.filter(
    (d) => d.dealKind === "happy_hour" && (d.city ?? "sf") === city,
  );
}

function dealsForWeekday(
  deals: CuratedFoodDeal[],
  weekday: FoodDealWeekday,
): CuratedFoodDeal[] {
  return deals.filter(
    (d) =>
      !d.schedule.weekdays.length || d.schedule.weekdays.includes(weekday),
  );
}

/** Local start/end for today’s happy-hour window (min/max across curated deals). */
export function cityHappyHourWindowForToday(
  city: FeedCity,
  now: Date,
  timeZone: string,
): { start: Date; end: Date } | null {
  const todayKey = dayKey(now, timeZone);
  const [y, m, d] = todayKey.split("-").map(Number);
  const weekday = zonedWeekday(now, timeZone);
  const matching = dealsForWeekday(dealsForCity(city), weekday);

  const schedules =
    matching.length > 0
      ? matching.map((deal) => deal.schedule)
      : FALLBACK_WINDOW.weekdays.includes(weekday)
        ? [FALLBACK_WINDOW]
        : [];

  if (!schedules.length) return null;

  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const schedule of schedules) {
    const start = fromZonedTime(
      y!,
      m!,
      d!,
      schedule.startHour,
      schedule.startMinute,
      0,
      timeZone,
    );
    let end = fromZonedTime(
      y!,
      m!,
      d!,
      schedule.endHour,
      schedule.endMinute,
      0,
      timeZone,
    );
    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + MS_PER_DAY);
    }
    minStart = Math.min(minStart, start.getTime());
    maxEnd = Math.max(maxEnd, end.getTime());
  }

  return { start: new Date(minStart), end: new Date(maxEnd) };
}

export function isInCityHappyHourWindow(
  city: FeedCity,
  now: Date,
  timeZone: string,
): boolean {
  const window = cityHappyHourWindowForToday(city, now, timeZone);
  if (!window) return false;
  const t = now.getTime();
  return t >= window.start.getTime() && t < window.end.getTime();
}

function formatWindowTime(date: Date, timeZone: string): string {
  return date.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildHappyHoursHubCard(
  city: FeedCity,
  now: Date,
  timeZone: string,
): FeedCard {
  const window = cityHappyHourWindowForToday(city, now, timeZone)!;
  const cityLabel = FEED_CITY_LABELS[city];
  const count = dealsForCity(city).length;
  const startLabel = formatWindowTime(window.start, timeZone);
  const endLabel = formatWindowTime(window.end, timeZone);

  return {
    kind: "recommendation",
    id: HAPPY_HOURS_HUB_CARD_ID,
    title: `${FEED_TOPIC_EMOJI.happy_hours} ${cityLabel} Happy Hours`,
    subtitle: `Browse ${count} curated spots · tap to see today’s deals`,
    startsAt: window.start.toISOString(),
    endsAt: window.end.toISOString(),
    imageUrl: happyHoursHubImageUrl(city),
    venueName: null,
    neighborhood: null,
    categories: ["food"],
    tags: ["happy_hours"],
    source: HAPPY_HOURS_HUB_SOURCE,
    recommendationLabel: `Happening now · ${startLabel}–${endLabel}`,
    url: null,
    score: 950,
    bucket: "serendipity",
  };
}

export function withHappyHoursHubCard(
  cards: FeedCard[],
  opts: {
    city: FeedCity;
    now: Date;
    timeZone: string;
    mode: FeedMode;
    topics: FeedTopic[];
    /** When false, skip (e.g. browsing a past/future day). */
    browsingToday?: boolean;
  },
): FeedCard[] {
  if (opts.mode !== "today" || opts.browsingToday === false) return cards;
  if (opts.topics.length > 0) return cards;
  if (cards.some((c) => c.source === "food_deals")) return cards;
  if (!isInCityHappyHourWindow(opts.city, opts.now, opts.timeZone)) {
    return cards;
  }
  const hub = buildHappyHoursHubCard(opts.city, opts.now, opts.timeZone);
  return [hub, ...cards];
}

/** Resolve feed city from metro area when injecting on area-scoped views. */
export function feedCityFromArea(area: FeedArea): FeedCity {
  return metroFromArea(area);
}
