/**
 * Recurring schedule helpers — weekly / nth-weekday templates.
 * Used by comedy rooms (and any future recurring vertical): one durable
 * events row + expand at feed read (same pattern as food_deals).
 */

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

function nthWeekdayOfMonth(day: Date): number {
  return Math.ceil(day.getDate() / 7);
}

export function recurringMatchesDay(
  schedule: RecurringSchedule,
  day: Date,
): boolean {
  if (schedule.weekday != null && day.getDay() !== schedule.weekday) {
    return false;
  }
  if (schedule.nthWeekday != null) {
    if (nthWeekdayOfMonth(day) !== schedule.nthWeekday) return false;
  }
  return true;
}

export function recurringTimeOnDay(
  schedule: RecurringSchedule,
  day: Date,
): RecurringOccurrence {
  const startsAt = new Date(day);
  startsAt.setHours(schedule.hour, schedule.minute, 0, 0);
  return { startsAt };
}

export function nextRecurringOccurrence(
  schedule: RecurringSchedule,
  now: Date,
  horizonDays = 60,
): RecurringOccurrence | null {
  for (let d = 0; d < horizonDays; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    if (!recurringMatchesDay(schedule, day)) continue;
    const occ = recurringTimeOnDay(schedule, day);
    if (occ.startsAt.getTime() < now.getTime() - 3600000) continue;
    return occ;
  }
  return null;
}

export function expandRecurringOccurrences(
  schedule: RecurringSchedule,
  windowStart: Date,
  windowEnd: Date,
): RecurringOccurrence[] {
  const out: RecurringOccurrence[] = [];
  const day = new Date(windowStart);
  day.setHours(0, 0, 0, 0);
  const endMs = windowEnd.getTime();
  const maxDays = 45;
  for (let i = 0; i < maxDays; i++) {
    if (day.getTime() > endMs) break;
    if (recurringMatchesDay(schedule, day)) {
      const occ = recurringTimeOnDay(schedule, day);
      if (
        occ.startsAt.getTime() >= windowStart.getTime() &&
        occ.startsAt.getTime() <= endMs
      ) {
        out.push(occ);
      }
    }
    day.setDate(day.getDate() + 1);
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
    if (!schedule || opts.mode === "for_you") {
      out.push(row);
      continue;
    }

    const occurrences = expandRecurringOccurrences(
      schedule,
      opts.windowStart,
      opts.windowEnd,
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
