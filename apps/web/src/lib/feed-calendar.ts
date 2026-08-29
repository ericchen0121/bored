import type { FeedCard } from "@bored/shared";
import { addCalendarDays, dayKey } from "@bored/shared";

export type FeedCalendarMeta = {
  daysWithEvents: Set<string>;
  minDate: string;
  maxDate: string;
};

/** Derive calendar dots and selectable range from a By-time overview fetch. */
export function feedCalendarMeta(
  cards: FeedCard[],
  timeZone: string,
  now: Date = new Date(),
): FeedCalendarMeta {
  const today = dayKey(now, timeZone);
  const daysWithEvents = new Set<string>();
  let maxDate = today;

  for (const card of cards) {
    const key = dayKey(card.startsAt, timeZone);
    if (key < today) continue;
    daysWithEvents.add(key);
    if (key > maxDate) maxDate = key;
  }

  return { daysWithEvents, minDate: today, maxDate };
}

export function monthStartKey(yyyyMmDd: string): string {
  const [y, m] = yyyyMmDd.split("-");
  return `${y}-${m}-01`;
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function calendarGridDays(viewMonthStart: string): string[] {
  const [y, m] = viewMonthStart.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const startPad = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < startPad; i++) cells.push("");
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }
  return cells;
}

export function monthLabel(yyyyMmDd: string, timeZone: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const noon = new Date(Date.UTC(y!, m! - 1, d!, 12));
  return noon.toLocaleDateString("en-US", {
    timeZone,
    month: "long",
    year: "numeric",
  });
}

export function isDateInStrip(
  dateKey: string,
  stripKeys: string[],
): boolean {
  return stripKeys.includes(dateKey);
}

/** Default overview horizon when scrape returns no timed rows yet. */
export function defaultCalendarMaxDate(
  minDate: string,
  fallbackDays = 30,
): string {
  return addCalendarDays(minDate, fallbackDays);
}
