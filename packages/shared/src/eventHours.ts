/**
 * Day-window hours for untimed / pick-a-slot listings (Ticketmaster TBA
 * cruises, exhibition daily hours, etc.). `open`/`close` are 24h `HH:MM`.
 */

import { TIME_TBA_TAG, isTimeTbaTag } from "./datetime";

export type DailyHours = {
  open: string;
  close: string;
};

const HH_MM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Clock label → minutes from midnight, or null. */
export function parseClockToMinutes(raw: string): number | null {
  const s = raw.trim();
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2] ?? "0");
    const ap = m12[3]!.toUpperCase();
    if (h === 12) h = 0;
    if (ap === "PM") h += 12;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  const m24 = s.match(HH_MM_RE);
  if (m24) {
    return Number(m24[1]) * 60 + Number(m24[2]);
  }
  return null;
}

export function minutesToHhMm(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Feed/detail label — `9am–8pm` (en-US, no space before am/pm). */
export function formatDailyHoursLabel(hours: DailyHours): string {
  const fmt = (hhmm: string) => {
    const mins = parseClockToMinutes(hhmm);
    if (mins == null) return hhmm;
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h24 >= 12 ? "pm" : "am";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, "0")}${ap}`;
  };
  return `${fmt(hours.open)}–${fmt(hours.close)}`;
}

/**
 * Min/max wall-clock from free-form labels (e.g. TM secnames
 * `"09:00AM CRUISE"`, `"8:00PM CRUISE"`).
 */
export function dailyHoursFromClockLabels(
  labels: Iterable<string>,
): DailyHours | null {
  let min: number | null = null;
  let max: number | null = null;
  for (const label of labels) {
    for (const m of label.matchAll(
      /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi,
    )) {
      const mins = parseClockToMinutes(m[0]!);
      if (mins == null) continue;
      if (min == null || mins < min) min = mins;
      if (max == null || mins > max) max = mins;
    }
  }
  if (min == null || max == null || max <= min) return null;
  return { open: minutesToHhMm(min), close: minutesToHhMm(max) };
}

export function dailyHoursFromPayload(
  rawPayload: unknown,
): DailyHours | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const hours = (rawPayload as { dailyHours?: unknown }).dailyHours;
  if (!hours || typeof hours !== "object") return null;
  const open = (hours as { open?: unknown }).open;
  const close = (hours as { close?: unknown }).close;
  if (typeof open !== "string" || typeof close !== "string") return null;
  if (!HH_MM_RE.test(open) || !HH_MM_RE.test(close)) return null;
  return { open, close };
}

/** Untimed listing label: hours window, else “Times vary”. */
export function timeTbaWhenLabel(
  tags: string[] | null | undefined,
  rawPayload: unknown,
  fallback = "Times vary",
): string | null {
  if (!isTimeTbaTag(tags)) return null;
  const hours = dailyHoursFromPayload(rawPayload);
  return hours ? formatDailyHoursLabel(hours) : fallback;
}

export { TIME_TBA_TAG };
