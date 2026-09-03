import { dayKey } from "./datetime";

/**
 * Ticketmaster (and some calendars) append age gates to the show title.
 * Strip before dedupe so "Roni Size" and "Roni Size (21 and Over)" group.
 */
const AGE_GATE_SUFFIX =
  /\s*[(\[]?\s*(?:\d{1,2}\s*(?:\+|plus|(?:and|&)\s*over)|all\s*ages)\s*[)\]]?\s*$/i;

export function stripTicketTitleNoise(title: string): string {
  let t = title.trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(AGE_GATE_SUFFIX, "").trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

export function normalizeOccurrenceLabel(value: string): string {
  return stripTicketTitleNoise(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** City parentheticals / suffixes 19hz appends — strip before grouping. */
const VENUE_CITY_PAREN =
  /\s*\((?:san francisco|oakland|berkeley|san jose|chicago|sf|sj|bay area)\)\s*$/i;
const VENUE_CITY_SUFFIX =
  /\s*[-–,]\s*(?:san francisco|oakland|berkeley|san jose|chicago|sf)\s*$/i;

/**
 * Venue identity for dedupe: "Bella (San Francisco)" → "bella",
 * "Temple SF" → "temple".
 */
export function normalizeVenueName(venue: string | null | undefined): string {
  if (!venue?.trim()) return "";
  const stripped = venue
    .trim()
    .replace(VENUE_CITY_PAREN, "")
    .replace(VENUE_CITY_SUFFIX, "")
    .replace(/\s+(?:sf|sj)\s*$/i, "")
    .trim();
  return normalizeOccurrenceLabel(stripped);
}

export type EventOccurrence = {
  startsAt: string;
  url?: string | null;
  sourceEventId?: string;
};

export type OccurrenceCarrier = {
  title: string;
  venueName?: string | null;
  startsAt: Date;
  timezone?: string | null;
  url?: string | null;
  sourceEventId?: string;
  rawPayload?: unknown;
};

function readStoredOccurrences(rawPayload: unknown): EventOccurrence[] {
  if (!rawPayload || typeof rawPayload !== "object") return [];
  const occ = (rawPayload as { occurrences?: unknown }).occurrences;
  if (!Array.isArray(occ)) return [];
  const out: EventOccurrence[] = [];
  for (const item of occ) {
    if (!item || typeof item !== "object") continue;
    const startsAt = (item as { startsAt?: unknown }).startsAt;
    if (typeof startsAt !== "string") continue;
    out.push({
      startsAt,
      url:
        typeof (item as { url?: unknown }).url === "string"
          ? (item as { url: string }).url
          : null,
      sourceEventId:
        typeof (item as { sourceEventId?: unknown }).sourceEventId === "string"
          ? (item as { sourceEventId: string }).sourceEventId
          : undefined,
    });
  }
  return out;
}

export function toOccurrence(row: OccurrenceCarrier): EventOccurrence {
  return {
    startsAt: row.startsAt.toISOString(),
    url: row.url ?? null,
    sourceEventId: row.sourceEventId,
  };
}

function sortOccurrences(list: EventOccurrence[]): EventOccurrence[] {
  return [...list].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

export function dedupeOccurrences(list: EventOccurrence[]): EventOccurrence[] {
  const seen = new Set<string>();
  const out: EventOccurrence[] = [];
  for (const item of sortOccurrences(list)) {
    const key = item.startsAt;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** All times for a listing — stored occurrences or the row itself. */
export function eventOccurrences(row: OccurrenceCarrier): EventOccurrence[] {
  const stored = readStoredOccurrences(row.rawPayload);
  if (stored.length) return dedupeOccurrences(stored);
  return [toOccurrence(row)];
}

/**
 * Times for the listing's local calendar day (the day the feed card / detail
 * represents). Multi-day runs store one row per day; soft-merge must not leak
 * sibling days into the preview.
 */
export function eventOccurrencesOnLocalDay(
  row: OccurrenceCarrier,
  timezone?: string | null,
): EventOccurrence[] {
  const tz = timezone ?? row.timezone ?? "America/Los_Angeles";
  const day = dayKey(row.startsAt, tz);
  return eventOccurrences(row).filter((o) => dayKey(o.startsAt, tz) === day);
}

/** Max times shown on a feed card; full schedule lives on event details. */
export const FEED_TIMES_PREVIEW_LIMIT = 3;

export type EventTimePreview = {
  startsAt: string;
  theaterName: string;
  ticketUrl: string | null;
};

/** Feed-card preview times — only when there are multiple showings that day. */
export function eventTimesPreview(
  row: OccurrenceCarrier,
  venueName?: string | null,
): { times: EventTimePreview[]; moreCount: number } | undefined {
  const occurrences = eventOccurrencesOnLocalDay(row);
  if (occurrences.length <= 1) return undefined;
  const name = venueName ?? row.venueName ?? "";
  return {
    times: occurrences.slice(0, FEED_TIMES_PREVIEW_LIMIT).map((o) => ({
      startsAt: o.startsAt,
      theaterName: name,
      ticketUrl: o.url ?? null,
    })),
    moreCount: Math.max(0, occurrences.length - FEED_TIMES_PREVIEW_LIMIT),
  };
}

/** Stable hash input for grouping same title + venue + local day. */
export function occurrenceGroupLabel(
  title: string,
  venue: string | null | undefined,
  startsAt: Date | string,
  timezone: string,
): string {
  return [
    normalizeOccurrenceLabel(title),
    normalizeVenueName(venue),
    dayKey(startsAt, timezone),
  ].join("|");
}
