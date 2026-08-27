import type { FeedArea, FeedCard } from "@bored/shared";
import {
  addCalendarDays,
  dayKey as sharedDayKey,
  locationDefaultForArea,
} from "@bored/shared";

export {
  addCalendarDays,
  calendarDayBounds,
  dayCardLabel,
  dayKey,
  parseFeedDate,
  upcomingDayKeys,
} from "@bored/shared";

export function timeZoneForArea(area: FeedArea): string {
  return locationDefaultForArea(area).timezone;
}

export function formatWhen(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatDayOnly(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function formatDayHeading(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const key = sharedDayKey(iso, timeZone);
  const today = sharedDayKey(now, timeZone);
  if (key === today) return "Today";
  if (key === addCalendarDays(today, 1)) return "Tomorrow";

  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export type DayGroup = {
  key: string;
  label: string;
  cards: FeedCard[];
};

export function groupCardsByDay(
  cards: FeedCard[],
  timeZone: string,
  now: Date = new Date(),
): DayGroup[] {
  const map = new Map<string, FeedCard[]>();
  for (const card of cards) {
    const key = sharedDayKey(card.startsAt, timeZone);
    const list = map.get(key);
    if (list) list.push(card);
    else map.set(key, [card]);
  }

  return [...map.entries()].map(([key, group]) => ({
    key,
    label: formatDayHeading(group[0]!.startsAt, timeZone, now),
    cards: group,
  }));
}
