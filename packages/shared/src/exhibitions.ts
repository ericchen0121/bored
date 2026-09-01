/**
 * Long-running exhibitions / installations — Discover LA, DoLA daily calendar
 * slots, and similar sources. One durable row + feed expand (food_deals pattern).
 */

import {
  calendarDayBounds,
  dayKey,
  fromZonedTime,
  isHappeningNow,
  isTimeTbaTag,
} from "./datetime";
import { suggestionStartsAt } from "./foodTips";

export type ExhibitionDailyHours = {
  /** 24h `HH:MM` local wall clock */
  open: string;
  /** May be before open when closing after midnight (e.g. 01:00) */
  close: string;
};

export type ExhibitionSchedule = {
  /** Inclusive local calendar start `YYYY-MM-DD` */
  runStart: string;
  /** Inclusive local calendar end `YYYY-MM-DD` */
  runEnd: string;
  dailyHours?: ExhibitionDailyHours | null;
  /** Do Stuff Media numeric id when known */
  doStuffId?: number | null;
};

const WALL_CLOCK_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

const DISCOVER_LA_EVENT_RE =
  /discoverlosangeles\.com\/event\/(\d{4})\/(\d{2})\/(\d{2})\//i;

/** Discover LA hero line: `May 9 - Nov 20, 2026 - 2027 at 4:00AM - 1:00AM` */
const DISCOVER_LA_SCHEDULE_RE =
  /([A-Za-z]+\s+\d+)\s*-\s*([A-Za-z]+\s+\d+,\s*\d+(?:\s*-\s*\d+)?)\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i;

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/** Parse ISO-ish string using wall clock in `timeZone` (ignore bogus offsets). */
export function parseWallClockIso(
  iso: string | null | undefined,
  timeZone: string,
): Date | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(WALL_CLOCK_RE);
  if (!m) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  return fromZonedTime(y, mo, d, h, mi, s, timeZone);
}

function parseMonthDayYear(text: string, defaultYear?: number): string | null {
  const cleaned = text.trim().replace(/\s*-\s*\d+\s*$/, "");
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase()];
  if (month == null) return null;
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : defaultYear;
  if (!year || !day) return null;
  const dt = new Date(Date.UTC(year, month, day));
  if (dt.getUTCMonth() !== month || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

function parseAmPmTo24h(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function discoverLaRunStartFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const m = url.match(DISCOVER_LA_EVENT_RE);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Parse schedule line from Discover LA HTML (best-effort). */
export function parseDiscoverLaScheduleLine(
  html: string,
): Partial<ExhibitionSchedule> | null {
  const m = html.match(DISCOVER_LA_SCHEDULE_RE);
  if (!m) return null;
  const startYear =
    Number(m[2]!.match(/(\d{4})/)?.[1]) ||
    Number(m[2]!.match(/(\d{4})\s*-\s*(\d{4})/)?.[2]) ||
    new Date().getFullYear();
  const runStart = parseMonthDayYear(m[1]!, startYear);
  const runEnd = parseMonthDayYear(m[2]!, startYear);
  const open = parseAmPmTo24h(m[3]!);
  const close = parseAmPmTo24h(m[4]!);
  if (!runStart || !runEnd) return null;
  return {
    runStart,
    runEnd: runEnd < runStart ? runEnd : runEnd,
    dailyHours: open && close ? { open, close } : null,
  };
}

export function exhibitionScheduleFromPayload(
  rawPayload: unknown,
): ExhibitionSchedule | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const ex = (rawPayload as { exhibition?: unknown }).exhibition;
  if (!ex || typeof ex !== "object") return null;
  const runStart = (ex as { runStart?: unknown }).runStart;
  const runEnd = (ex as { runEnd?: unknown }).runEnd;
  if (typeof runStart !== "string" || typeof runEnd !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runStart) || !/^\d{4}-\d{2}-\d{2}$/.test(runEnd)) {
    return null;
  }
  const daily = (ex as { dailyHours?: unknown }).dailyHours;
  let dailyHours: ExhibitionDailyHours | null = null;
  if (daily && typeof daily === "object") {
    const open = (daily as { open?: unknown }).open;
    const close = (daily as { close?: unknown }).close;
    if (typeof open === "string" && typeof close === "string") {
      dailyHours = { open, close };
    }
  }
  const doStuffId = (ex as { doStuffId?: unknown }).doStuffId;
  return {
    runStart,
    runEnd,
    dailyHours,
    doStuffId: typeof doStuffId === "number" ? doStuffId : null,
  };
}

export function isExhibitionTag(tags: string[] | null | undefined): boolean {
  return Boolean(tags?.some((t) => t.trim().toLowerCase() === "exhibition"));
}

export function isExhibitionListing(opts: {
  source?: string | null;
  tags?: string[] | null;
  rawPayload?: unknown;
  url?: string | null;
  description?: string | null;
  categories?: string[] | null;
}): boolean {
  if (isExhibitionTag(opts.tags)) return true;
  if (exhibitionScheduleFromPayload(opts.rawPayload)) return true;
  return isExhibitionCandidate(opts);
}

/** Heuristic — used at ingest before payload is stamped. */
export function isExhibitionCandidate(opts: {
  source?: string | null;
  url?: string | null;
  description?: string | null;
  categories?: string[] | null;
  title?: string | null;
}): boolean {
  const url = opts.url?.toLowerCase() ?? "";
  if (DISCOVER_LA_EVENT_RE.test(url)) return true;

  const blob = [
    opts.title ?? "",
    opts.description ?? "",
    ...(opts.categories ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /exhibition|installation|lightbox|on view through|open through|gallery show|museum exhibit/.test(
      blob,
    )
  ) {
    return true;
  }

  return false;
}

const MS_PER_DAY = 86400000;

export function isLongRunningTimedEvent(
  startsAt: string | Date,
  endsAt?: string | Date | null,
): boolean {
  if (!endsAt) return false;
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return end.getTime() - start.getTime() > MS_PER_DAY;
}

/** Exhibitions, TBA-time listings, and multi-day runs never get the live badge. */
export function isFeedEventLive(
  startsAt: string | Date,
  endsAt?: string | Date | null,
  now: Date = new Date(),
  opts?: {
    tags?: string[] | null;
    rawPayload?: unknown;
  },
): boolean {
  if (isExhibitionListing({ tags: opts?.tags, rawPayload: opts?.rawPayload })) {
    return false;
  }
  if (isTimeTbaTag(opts?.tags)) return false;
  if (isLongRunningTimedEvent(startsAt, endsAt)) return false;
  return isHappeningNow(startsAt, endsAt, now);
}

function formatShortDate(yyyyMmDd: string, timeZone: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = fromZonedTime(y!, m!, d!, 12, 0, 0, timeZone);
  return dt.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year:
      y !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/** Feed/detail label — `Through Nov 20` or `May 9 – Nov 20`. */
export function exhibitionWhenLabel(
  schedule: ExhibitionSchedule,
  timeZone: string,
): string {
  const startLabel = formatShortDate(schedule.runStart, timeZone);
  const endLabel = formatShortDate(schedule.runEnd, timeZone);
  if (schedule.runStart === schedule.runEnd) return startLabel;
  const today = dayKey(new Date(), timeZone);
  if (today <= schedule.runEnd && today >= schedule.runStart) {
    return `Through ${endLabel}`;
  }
  return `${startLabel} – ${endLabel}`;
}

/** Short timeline / card time column — dates live on the detail page. */
export const EXHIBITION_FEED_TIME_LABEL = "On view";

export function exhibitionFeedTimeLabel(): string {
  return EXHIBITION_FEED_TIME_LABEL;
}

/** Stable late-day slot so exhibitions sort to the bottom of Today’s chrono list. */
function exhibitionStableLateSlot(
  stableId: string,
  localDay: string,
  timeZone: string,
): Date {
  const [y, m, d] = localDay.split("-").map(Number);
  let hash = 0;
  for (let i = 0; i < stableId.length; i++) {
    hash = (hash * 31 + stableId.charCodeAt(i)) >>> 0;
  }
  const offsetMin = hash % 181;
  const h = 20 + Math.floor(offsetMin / 60);
  const mi = offsetMin % 60;
  return fromZonedTime(y!, m!, d!, h, mi, 0, timeZone);
}

export function exhibitionStartsAtForFeed(
  schedule: ExhibitionSchedule,
  stableId: string,
  timeZone: string,
  now: Date = new Date(),
): Date {
  const today = dayKey(now, timeZone);
  if (today >= schedule.runStart && today <= schedule.runEnd) {
    const slot = exhibitionStableLateSlot(stableId, today, timeZone);
    const { end } = calendarDayBounds(today, timeZone);
    const endOfDay = new Date(end.getTime() - 1);
    if (slot.getTime() > now.getTime() + 30 * 60000) return slot;
    return endOfDay;
  }
  return suggestionStartsAt(stableId, null);
}

export function runBoundsUtc(
  schedule: ExhibitionSchedule,
  timeZone: string,
): { start: Date; end: Date } {
  const start = calendarDayBounds(schedule.runStart, timeZone).start;
  const end = calendarDayBounds(schedule.runEnd, timeZone).end;
  return { start, end };
}

export function isWithinExhibitionRun(
  schedule: ExhibitionSchedule,
  instant: Date,
  timeZone: string,
): boolean {
  const { start, end } = runBoundsUtc(schedule, timeZone);
  const t = instant.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * Expand durable exhibition rows into the feed window.
 * - `for_you`: one card (stable midday slot within the run)
 * - timed modes: at most one card when the window overlaps the run
 */
export function expandExhibitionRowsForFeed<
  T extends {
    source: string;
    startsAt: Date;
    endsAt?: Date | null;
    timezone?: string | null;
    sourceEventId?: string;
    tags?: string[] | null;
    rawPayload?: unknown;
  },
>(
  rows: T[],
  opts: {
    mode: string;
    windowStart: Date;
    windowEnd: Date;
  },
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const schedule = exhibitionScheduleFromPayload(row.rawPayload);
    if (!schedule) {
      out.push(row);
      continue;
    }

    const tz = row.timezone ?? "America/Los_Angeles";
    const { start: runStart, end: runEnd } = runBoundsUtc(schedule, tz);
    const windowStart = opts.windowStart.getTime();
    const windowEnd = opts.windowEnd.getTime();

    if (runEnd.getTime() <= windowStart || runStart.getTime() >= windowEnd) {
      continue;
    }

    const stableId = row.sourceEventId ?? schedule.doStuffId?.toString() ?? "exhibition";
    const startsAt = exhibitionStartsAtForFeed(schedule, stableId, tz, opts.windowStart);

    out.push({
      ...row,
      startsAt,
      endsAt: runEnd,
    });
  }
  return out;
}

/** Ranker helper — deprioritize exhibitions in timed sorts. */
export function exhibitionTimeScorePenalty(
  tags: string[] | null | undefined,
  rawPayload: unknown,
): number {
  return isExhibitionListing({ tags, rawPayload }) ? 0.35 : 0;
}
