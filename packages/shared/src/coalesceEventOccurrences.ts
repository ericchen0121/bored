import { createHash } from "node:crypto";
import { dayKey } from "./datetime";
import {
  dedupeOccurrences,
  eventOccurrences,
  normalizeOccurrenceLabel,
  occurrenceGroupLabel,
  type OccurrenceCarrier,
  toOccurrence,
} from "./eventOccurrences";

/** Stable hash for grouping same title + venue + local day. */
export function occurrenceGroupKey(
  title: string,
  venue: string | null | undefined,
  startsAt: Date | string,
  timezone: string,
): string {
  const label = occurrenceGroupLabel(title, venue, startsAt, timezone);
  return createHash("sha256").update(label).digest("hex").slice(0, 32);
}

/** Title + venue only — for multi-day run grouping. */
export function runGroupKey(
  title: string,
  venue: string | null | undefined,
): string {
  return [
    normalizeOccurrenceLabel(title),
    normalizeOccurrenceLabel(venue ?? ""),
  ].join("|");
}

function pickCanonical<T extends OccurrenceCarrier>(group: T[]): T {
  return [...group].sort((a, b) => {
    const aImg = "imageUrl" in a && a.imageUrl ? 1 : 0;
    const bImg = "imageUrl" in b && b.imageUrl ? 1 : 0;
    if (aImg !== bImg) return bImg - aImg;
    return a.startsAt.getTime() - b.startsAt.getTime();
  })[0]!;
}

/**
 * Collapse duplicate listings (same title + venue + local day) into one row.
 * Keeps earliest `startsAt`; extra times live in `rawPayload.occurrences`.
 */
export function coalesceEventOccurrences<T extends OccurrenceCarrier>(
  rows: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const tz = row.timezone ?? "America/Los_Angeles";
    const key = occurrenceGroupKey(row.title, row.venueName, row.startsAt, tz);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }

    const canonical = pickCanonical(group);
    const occurrences = dedupeOccurrences(
      group.flatMap((row) => eventOccurrences(row)),
    );
    const earliest = new Date(occurrences[0]!.startsAt);
    const payload =
      (canonical.rawPayload as Record<string, unknown> | null | undefined) ??
      {};

    out.push({
      ...canonical,
      startsAt: earliest,
      url: occurrences.find((o) => o.url)?.url ?? canonical.url ?? null,
      rawPayload: {
        ...payload,
        occurrences,
        coalescedFrom: group.map((g) => g.sourceEventId).filter(Boolean),
      },
    });
  }

  return out;
}

/**
 * Ingest-time collapse for adapters that emit one row per showtime (Ticketmaster).
 * Keeps the canonical row's **native** `sourceEventId` (do not rewrite to a group
 * key — that orphaned natives on the next run). Sibling ids land in
 * `rawPayload.coalescedFrom` for GC.
 */
export function coalesceNormalizedOccurrences<
  T extends OccurrenceCarrier & { source: string; sourceEventId: string },
>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const tz = row.timezone ?? "America/Los_Angeles";
    const key = occurrenceGroupKey(row.title, row.venueName, row.startsAt, tz);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }

    const canonical = pickCanonical(group);
    const occurrences = dedupeOccurrences(group.map(toOccurrence));
    const earliest = new Date(occurrences[0]!.startsAt);
    const payload =
      (canonical.rawPayload as Record<string, unknown> | null | undefined) ??
      {};
    const coalescedFrom = group.map((g) => g.sourceEventId);

    out.push({
      ...canonical,
      // Keep native TM id — never `${source}:${groupKey}`
      sourceEventId: canonical.sourceEventId,
      startsAt: earliest,
      url: occurrences.find((o) => o.url)?.url ?? canonical.url ?? null,
      rawPayload: {
        ...payload,
        occurrences,
        coalescedFrom,
      },
    });
  }

  return out;
}

/**
 * Ids that were merged away and must be deleted after upsert so they don't
 * linger as stale natives / prior singles.
 */
export function collectCoalesceOrphanIds<
  T extends { sourceEventId: string; rawPayload?: unknown },
>(rows: T[]): string[] {
  const keep = new Set(rows.map((r) => r.sourceEventId));
  const orphans = new Set<string>();
  for (const row of rows) {
    const payload =
      (row.rawPayload as { coalescedFrom?: unknown } | null | undefined) ?? null;
    const from = payload?.coalescedFrom;
    if (!Array.isArray(from)) continue;
    for (const id of from) {
      if (typeof id !== "string" || !id) continue;
      if (keep.has(id)) continue;
      orphans.add(id);
    }
  }
  return [...orphans];
}

/** Default max distinct local days kept per title+venue run. */
export const DEFAULT_MULTI_DAY_RUN_CAP = 7;

/**
 * Cap long multi-day runs (exhibitions, long comedy sits) so one attraction
 * can't flood the feed. Keeps the next `maxDays` distinct local days per
 * title+venue; marks `rawPayload.runTruncated` when more existed.
 */
export function capMultiDayRuns<
  T extends OccurrenceCarrier & { source: string; sourceEventId: string },
>(rows: T[], maxDays = DEFAULT_MULTI_DAY_RUN_CAP): T[] {
  if (maxDays < 1) return rows;

  const byRun = new Map<string, T[]>();
  for (const row of rows) {
    const key = runGroupKey(row.title, row.venueName);
    const list = byRun.get(key) ?? [];
    list.push(row);
    byRun.set(key, list);
  }

  const out: T[] = [];
  for (const group of byRun.values()) {
    const sorted = [...group].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );

    // One row per local day (post same-day coalesce); count then slice.
    const byDay = new Map<string, T>();
    for (const row of sorted) {
      const tz = row.timezone ?? "America/Los_Angeles";
      const day = dayKey(row.startsAt, tz);
      if (!byDay.has(day)) byDay.set(day, row);
    }
    const dayRows = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => row);
    const totalDays = dayRows.length;
    const kept = dayRows.slice(0, maxDays);
    const truncated = totalDays > maxDays;

    for (const row of kept) {
      if (!truncated) {
        out.push(row);
        continue;
      }
      const payload =
        (row.rawPayload as Record<string, unknown> | null | undefined) ?? {};
      out.push({
        ...row,
        rawPayload: {
          ...payload,
          runDayCount: totalDays,
          runDaysKept: maxDays,
          runTruncated: true,
        },
      });
    }
  }

  return out;
}

/**
 * Ticketmaster / comedy_venue post-process: same-day coalesce → multi-day cap.
 * Returns events plus orphan native ids (with source) to delete after upsert.
 */
export function finalizeTicketmasterEvents<
  T extends OccurrenceCarrier & { source: string; sourceEventId: string },
>(
  rows: T[],
  opts?: { maxDays?: number },
): {
  events: T[];
  orphans: { source: string; sourceEventId: string }[];
} {
  const coalesced = coalesceNormalizedOccurrences(rows);
  const capped = capMultiDayRuns(
    coalesced,
    opts?.maxDays ?? DEFAULT_MULTI_DAY_RUN_CAP,
  );
  const keep = new Set(capped.map((r) => r.sourceEventId));
  const orphanMap = new Map<string, string>(); // id -> source

  for (const id of collectCoalesceOrphanIds(coalesced)) {
    const donor = coalesced.find((r) =>
      Array.isArray(
        (r.rawPayload as { coalescedFrom?: string[] } | null)?.coalescedFrom,
      )
        ? (r.rawPayload as { coalescedFrom: string[] }).coalescedFrom.includes(
            id,
          )
        : false,
    );
    const source =
      rows.find((r) => r.sourceEventId === id)?.source ??
      donor?.source ??
      "ticketmaster";
    orphanMap.set(id, source);
  }
  for (const row of coalesced) {
    if (!keep.has(row.sourceEventId)) {
      orphanMap.set(row.sourceEventId, row.source);
    }
  }

  return {
    events: capped,
    orphans: [...orphanMap.entries()].map(([sourceEventId, source]) => ({
      source,
      sourceEventId,
    })),
  };
}

/** True if id looks like a legacy `${source}:${32-hex}` coalesce rewrite. */
export function isLegacyCoalesceSourceEventId(
  source: string,
  sourceEventId: string,
): boolean {
  return sourceEventId.startsWith(`${source}:`) &&
    /^[a-f0-9]{32}$/i.test(sourceEventId.slice(source.length + 1));
}
