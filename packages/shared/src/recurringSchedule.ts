/**
 * Recurring schedule helpers — weekly / nth-weekday templates.
 * Used by comedy rooms (and any future recurring vertical): one durable
 * events row + expand at feed read (same pattern as food_deals).
 */

import {
  addCalendarDays,
  dayKey,
  fromZonedTime,
  zonedWeekday,
} from "./datetime";

export type RecurringSchedule = {
  /** 0=Sun … 6=Sat; null = every day (rare) */
  weekday: number | null;
  /** 1–5 = nth weekday of month; null = every matching weekday */
  nthWeekday: number | null;
  hour: number;
  minute: number;
};

export type RecurringOccurrence = {
  startsAt: Date;
};

function nthWeekdayOfMonth(yyyyMmDd: string): number {
  const dayOfMonth = Number(yyyyMmDd.slice(8, 10));
  return Math.ceil(dayOfMonth / 7);
}

export function recurringMatchesDay(
  schedule: RecurringSchedule,
  yyyyMmDd: string,
  timeZone: string,
): boolean {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const noon = fromZonedTime(y!, m!, d!, 12, 0, 0, timeZone);
  if (
    schedule.weekday != null &&
    zonedWeekday(noon, timeZone) !== schedule.weekday
  ) {
    return false;
  }
  if (schedule.nthWeekday != null) {
    if (nthWeekdayOfMonth(yyyyMmDd) !== schedule.nthWeekday) return false;
  }
  return true;
}

export function recurringTimeOnDay(
  schedule: RecurringSchedule,
  yyyyMmDd: string,
  timeZone: string,
): RecurringOccurrence {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const startsAt = fromZonedTime(
    y!,
    m!,
    d!,
    schedule.hour,
    schedule.minute,
    0,
    timeZone,
  );
  return { startsAt };
}

export function nextRecurringOccurrence(
  schedule: RecurringSchedule,
  now: Date,
  timeZone: string,
  horizonDays = 60,
): RecurringOccurrence | null {
  const today = dayKey(now, timeZone);
  for (let d = 0; d < horizonDays; d++) {
    const key = addCalendarDays(today, d);
    if (!recurringMatchesDay(schedule, key, timeZone)) continue;
    const occ = recurringTimeOnDay(schedule, key, timeZone);
    if (occ.startsAt.getTime() < now.getTime() - 3600000) continue;
    return occ;
  }
  return null;
}

export function expandRecurringOccurrences(
  schedule: RecurringSchedule,
  windowStart: Date,
  windowEnd: Date,
  timeZone: string,
): RecurringOccurrence[] {
  const out: RecurringOccurrence[] = [];
  let key = dayKey(windowStart, timeZone);
  const endKey = dayKey(windowEnd, timeZone);
  const endMs = windowEnd.getTime();
  const maxDays = 45;
  for (let i = 0; i < maxDays; i++) {
    if (key > endKey) break;
    if (recurringMatchesDay(schedule, key, timeZone)) {
      const occ = recurringTimeOnDay(schedule, key, timeZone);
      if (
        occ.startsAt.getTime() >= windowStart.getTime() &&
        occ.startsAt.getTime() <= endMs
      ) {
        out.push(occ);
      }
    }
    key = addCalendarDays(key, 1);
  }
  return out;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function formatHourMinute(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: minute === 0 ? undefined : "2-digit",
  });
}

/** `Thursdays · 8 PM`, `3rd Monday · 7:30 PM` */
export function recurringScheduleLabel(schedule: RecurringSchedule): string {
  const time = formatHourMinute(schedule.hour, schedule.minute);
  if (schedule.weekday == null) return `Daily · ${time}`;
  const day = WEEKDAY_LABELS[schedule.weekday] ?? "Weekly";
  if (schedule.nthWeekday != null) {
    const nth =
      schedule.nthWeekday === 1
        ? "1st"
        : schedule.nthWeekday === 2
          ? "2nd"
          : schedule.nthWeekday === 3
            ? "3rd"
            : `${schedule.nthWeekday}th`;
    return `${nth} ${day} · ${time}`;
  }
  return `${day}s · ${time}`;
}

export function recurringScheduleFromPayload(
  payload: Record<string, unknown> | null | undefined,
): RecurringSchedule | null {
  const raw = payload?.schedule;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<RecurringSchedule>;
  if (typeof s.hour !== "number" || typeof s.minute !== "number") return null;
  return {
    weekday: typeof s.weekday === "number" ? s.weekday : null,
    nthWeekday: typeof s.nthWeekday === "number" ? s.nthWeekday : null,
    hour: s.hour,
    minute: s.minute,
  };
}

/**
 * Expand durable `recurring` rows into the feed window.
 * - `for_you`: one card (row holds next occurrence)
 * - timed modes: one ephemeral card per matching day in the window
 */
export function expandRecurringRowsForFeed<
  T extends {
    source: string;
    startsAt: Date;
    endsAt?: Date | null;
    timezone?: string | null;
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
    if (row.source !== "recurring") {
      out.push(row);
      continue;
    }
    const payload =
      (row.rawPayload as Record<string, unknown> | null | undefined) ?? null;
    const schedule = recurringScheduleFromPayload(payload);
    const timeZone = row.timezone ?? "America/Los_Angeles";
    if (!schedule) {
      out.push(row);
      continue;
    }
    if (opts.mode === "for_you") {
      const next = nextRecurringOccurrence(schedule, new Date(), timeZone);
      out.push(next ? { ...row, startsAt: next.startsAt, endsAt: null } : row);
      continue;
    }

    const occurrences = expandRecurringOccurrences(
      schedule,
      opts.windowStart,
      opts.windowEnd,
      timeZone,
    );
    if (!occurrences.length) continue;

    for (const occ of occurrences) {
      out.push({
        ...row,
        startsAt: occ.startsAt,
        endsAt: null,
      });
    }
  }
  return out;
}
