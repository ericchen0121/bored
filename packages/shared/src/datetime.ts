/** Calendar / timezone helpers shared by API + web. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ingest tag when a source has a calendar day but no wall-clock start
 * (Ticketmaster `timeTBA` / `noSpecificTime`, etc.). Feed UI shows day-only.
 */
export const TIME_TBA_TAG = "time_tba";

export function isTimeTbaTag(tags: string[] | null | undefined): boolean {
  return Boolean(tags?.some((t) => t.trim().toLowerCase() === TIME_TBA_TAG));
}

export function parseFeedDate(
  value: string | null | undefined,
): string | null {
  if (!value || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Reject impossible calendar dates (e.g. 2026-02-31).
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return value;
}

/** Calendar day key `YYYY-MM-DD` in the given IANA timezone. */
export function dayKey(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Add (or subtract) whole calendar days to a `YYYY-MM-DD` key. */
export function addCalendarDays(yyyyMmDd: string, delta: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return dt.toISOString().slice(0, 10);
}

export function upcomingDayKeys(
  timeZone: string,
  count = 14,
  now: Date = new Date(),
): string[] {
  const today = dayKey(now, timeZone);
  const keys: string[] = [today];
  for (let i = 1; i < count; i++) {
    keys.push(addCalendarDays(today, i));
  }
  return keys;
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function fromZonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(new Date(utcGuess))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcGuess + (utcGuess - asUtc));
}

/** Inclusive start / exclusive end UTC bounds for a local calendar day. */
export function calendarDayBounds(
  yyyyMmDd: string,
  timeZone: string,
): { start: Date; end: Date } {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const start = fromZonedTime(y!, m!, d!, 0, 0, 0, timeZone);
  const next = addCalendarDays(yyyyMmDd, 1);
  const [ny, nm, nd] = next.split("-").map(Number);
  const end = fromZonedTime(ny!, nm!, nd!, 0, 0, 0, timeZone);
  return { start, end };
}

/**
 * Assumed length when `endsAt` is missing — used for “happening now” and
 * feed truncation. Prefer real `endsAt` from ingest whenever available.
 */
export const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

const MS_PER_DAY = 86400000;

function asDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** Effective end instant: `endsAt` or start + default duration.
 *  Overnight listings sometimes store end earlier than start (e.g. 6pm–2am
 *  with end on the same calendar day) — roll end forward by whole days.
 */
export function eventEndAt(
  startsAt: string | Date,
  endsAt?: string | Date | null,
  defaultDurationMs: number = DEFAULT_EVENT_DURATION_MS,
): Date {
  const start = asDate(startsAt);
  if (endsAt) {
    let end = asDate(endsAt);
    if (!Number.isNaN(end.getTime())) {
      // Same wall-clock overnight: end stamped before start → +1 day (repeat if needed).
      let guard = 0;
      while (end.getTime() <= start.getTime() && guard < 3) {
        end = new Date(end.getTime() + MS_PER_DAY);
        guard += 1;
      }
      if (end.getTime() > start.getTime()) return end;
    }
  }
  return new Date(start.getTime() + defaultDurationMs);
}

/**
 * True while the event is in progress.
 * Compares UTC instants (`Date.now()` vs stored timestamptz) — city/metro
 * timezone is only for display labels and calendar-day windows, not this check.
 */
export function isHappeningNow(
  startsAt: string | Date,
  endsAt?: string | Date | null,
  now: Date = new Date(),
  defaultDurationMs: number = DEFAULT_EVENT_DURATION_MS,
): boolean {
  const start = asDate(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const end = eventEndAt(startsAt, endsAt, defaultDurationMs);
  const t = now.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** Started earlier and already finished (not live). */
export function isEarlierEvent(
  startsAt: string | Date,
  endsAt?: string | Date | null,
  now: Date = new Date(),
  defaultDurationMs: number = DEFAULT_EVENT_DURATION_MS,
): boolean {
  const start = asDate(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  if (endsAt) {
    const end = asDate(endsAt);
    if (!Number.isNaN(end.getTime()) && end.getTime() - start.getTime() > MS_PER_DAY) {
      return end.getTime() < now.getTime();
    }
  }
  if (start.getTime() >= now.getTime()) return false;
  return !isHappeningNow(startsAt, endsAt, now, defaultDurationMs);
}

export type DayCardLabel = {
  key: string;
  weekday: string;
  dateLine: string;
  isToday: boolean;
  /** Fri / Sat / Sun in the given timezone. */
  isWeekend: boolean;
};

/** Funcheap-style day card: weekday on top, "Aug 26" underneath. */
export function dayCardLabel(
  yyyyMmDd: string,
  timeZone: string,
  now: Date = new Date(),
): DayCardLabel {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const noon = fromZonedTime(y!, m!, d!, 12, 0, 0, timeZone);
  const weekday = noon.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
  });
  const dateLine = noon.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  });
  const isWeekend =
    weekday === "Fri" || weekday === "Sat" || weekday === "Sun";
  return {
    key: yyyyMmDd,
    weekday,
    dateLine,
    isToday: yyyyMmDd === dayKey(now, timeZone),
    isWeekend,
  };
}
