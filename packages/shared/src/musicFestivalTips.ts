/** Flagship music festival listings — always surfaced via `music_festival` ingest. */

import { dayKey } from "./datetime";

export function isMusicFestivalSource(source: string | null | undefined): boolean {
  return source === "music_festival";
}

/** Compact date / range for the timeline time column (not a Today clock time). */
export function musicFestivalFeedDateLabel(
  startsAt: string | Date,
  endsAt: string | Date | null | undefined,
  timeZone: string,
): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Festival";

  const startLabel = start.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  });

  if (!endsAt) return startLabel;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return startLabel;

  const startDay = dayKey(start, timeZone);
  const endDay = dayKey(end, timeZone);
  if (startDay === endDay) return startLabel;

  const sameMonth =
    start.toLocaleDateString("en-US", { timeZone, month: "short" }) ===
    end.toLocaleDateString("en-US", { timeZone, month: "short" });

  if (sameMonth) {
    const endDayNum = end.toLocaleDateString("en-US", {
      timeZone,
      day: "numeric",
    });
    return `${startLabel}–${endDayNum}`;
  }

  const endLabel = end.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  });
  return `${startLabel}–${endLabel}`;
}
