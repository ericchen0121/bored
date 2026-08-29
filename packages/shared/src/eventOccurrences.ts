import { dayKey } from "./datetime";

export function normalizeOccurrenceLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

/** Feed-card preview times — only when there are multiple showings. */
export function eventTimesPreview(
  row: OccurrenceCarrier,
  venueName?: string | null,
): { startsAt: string; theaterName: string; ticketUrl: string | null }[] | undefined {
  const occurrences = eventOccurrences(row);
  if (occurrences.length <= 1) return undefined;
  const name = venueName ?? row.venueName ?? "";
  return occurrences.map((o) => ({
    startsAt: o.startsAt,
    theaterName: name,
    ticketUrl: o.url ?? null,
  }));
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
