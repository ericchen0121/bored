import { createHash } from "node:crypto";
import { dayKey } from "./datetime";
import {
  dedupeOccurrences,
  eventOccurrences,
  normalizeOccurrenceLabel,
  normalizeVenueName,
  occurrenceGroupLabel,
  type OccurrenceCarrier,
  toOccurrence,
} from "./eventOccurrences";
import {
  isGenericVenueName,
  listingIdentityUrl,
  musicTitlesSoftMatch,
  musicVenuesSoftMatch,
} from "./mergeMusicListings";

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
    normalizeVenueName(venue),
  ].join("|");
}

type SoftCarrier = OccurrenceCarrier & {
  source?: string;
  imageUrl?: string | null;
  organizer?: string | null;
};

/** Prefer flyer + richer listing when collapsing soft duplicates. */
function pickCanonical<T extends SoftCarrier>(group: T[]): T {
  return [...group].sort((a, b) => {
    const aImg = a.imageUrl ? 1 : 0;
    const bImg = b.imageUrl ? 1 : 0;
    if (aImg !== bImg) return bImg - aImg;
    const aOrg = a.organizer?.trim() ? 1 : 0;
    const bOrg = b.organizer?.trim() ? 1 : 0;
    if (aOrg !== bOrg) return bOrg - aOrg;
    if (a.title.length !== b.title.length) {
      return b.title.length - a.title.length;
    }
    return a.startsAt.getTime() - b.startsAt.getTime();
  })[0]!;
}

/** Prefer external ticket links; otherwise keep the canonical listing URL. */
function pickPreferredUrl(
  group: SoftCarrier[],
  canonical: SoftCarrier,
): string | null {
  const urls = group
    .map((g) => g.url?.trim())
    .filter((u): u is string => Boolean(u));
  if (!urls.length) return null;
  const external = urls.find((u) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
      return host !== "do312.com" && host !== "dolosangeles.com";
    } catch {
      return true;
    }
  });
  return external ?? canonical.url?.trim() ?? urls[0] ?? null;
}

function mergeOccurrenceGroup<T extends SoftCarrier>(group: T[]): T {
  const canonical = pickCanonical(group);
  const tz = canonical.timezone ?? "America/Los_Angeles";
  const day = dayKey(
    group.reduce((earliest, row) =>
      row.startsAt.getTime() < earliest.startsAt.getTime() ? row : earliest,
    ).startsAt,
    tz,
  );
  const occurrences = dedupeOccurrences(
    group.flatMap((row) => eventOccurrences(row)),
  ).filter((o) => dayKey(o.startsAt, tz) === day);
  const earliest = new Date(occurrences[0]!.startsAt);
  const payload =
    (canonical.rawPayload as Record<string, unknown> | null | undefined) ?? {};
  const priorFrom = Array.isArray(
    (payload as { coalescedFrom?: unknown }).coalescedFrom,
  )
    ? ((payload as { coalescedFrom: unknown[] }).coalescedFrom.filter(
        (id): id is string => typeof id === "string" && Boolean(id),
      ))
    : [];
  const coalescedFrom = [
    ...new Set([
      ...priorFrom,
      ...group.map((g) => g.sourceEventId).filter(Boolean),
    ]),
  ] as string[];

  return {
    ...canonical,
    startsAt: earliest,
    url: pickPreferredUrl(group, canonical),
    rawPayload: {
      ...payload,
      occurrences,
      coalescedFrom,
    },
  };
}

/**
 * Collapse duplicate listings (same title + venue + local day) into one row.
 * Then soft-merge same-source near-duplicates (shared ticket URL, or overlapping
 * titles at the same venue/night — e.g. Do312 dual listings).
 */
export function coalesceEventOccurrences<T extends SoftCarrier>(
  rows: T[],
): T[] {
  const exact = coalesceByExactKey(rows);
  return coalesceSoftDuplicates(exact);
}

function coalesceByExactKey<T extends SoftCarrier>(rows: T[]): T[] {
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
    out.push(mergeOccurrenceGroup(group));
  }
  return out;
}

function sameLocalDay(a: SoftCarrier, b: SoftCarrier): boolean {
  const tzA = a.timezone ?? "America/Los_Angeles";
  const tzB = b.timezone ?? "America/Los_Angeles";
  return dayKey(a.startsAt, tzA) === dayKey(b.startsAt, tzB);
}

function startsWithinHours(a: SoftCarrier, b: SoftCarrier, hours: number): boolean {
  return Math.abs(a.startsAt.getTime() - b.startsAt.getTime()) <= hours * 3600000;
}

/**
 * Venue compatible for soft same-source merge:
 * - real venues soft-match, or
 * - both generic/missing only when start times are nearly identical.
 */
function venuesCompatibleForSoftMerge(
  a: SoftCarrier,
  b: SoftCarrier,
): boolean {
  const aGeneric = isGenericVenueName(a.venueName);
  const bGeneric = isGenericVenueName(b.venueName);
  if (!aGeneric && !bGeneric) {
    return musicVenuesSoftMatch(a.venueName, b.venueName);
  }
  if (aGeneric && bGeneric) {
    return startsWithinHours(a, b, 1);
  }
  return false;
}

/**
 * Soft twin: shared ticket URL on the same local day (any source), or same
 * source + day + soft title + compatible venue. Same Universe/TM URL across
 * multi-day timed-entry runs must NOT collapse into one listing.
 */
export function listingsSoftDuplicateMatch(
  a: SoftCarrier,
  b: SoftCarrier,
): boolean {
  if (!sameLocalDay(a, b)) return false;

  const urlA = listingIdentityUrl(a.url);
  const urlB = listingIdentityUrl(b.url);
  if (urlA && urlB && urlA === urlB) return true;

  const sourceA = a.source;
  const sourceB = b.source;
  if (!sourceA || !sourceB || sourceA !== sourceB) return false;
  if (!musicTitlesSoftMatch(a.title, b.title)) return false;
  return venuesCompatibleForSoftMerge(a, b);
}

/**
 * Union soft-duplicate clusters after exact title+venue+day coalesce.
 */
export function coalesceSoftDuplicates<T extends SoftCarrier>(rows: T[]): T[] {
  if (rows.length < 2) return rows;

  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    let cur = i;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]!]!;
      cur = parent[cur]!;
    }
    return cur;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const byUrl = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const id = listingIdentityUrl(rows[i]!.url);
    if (!id) continue;
    const list = byUrl.get(id) ?? [];
    list.push(i);
    byUrl.set(id, list);
  }
  for (const idxs of byUrl.values()) {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const ia = idxs[a]!;
        const ib = idxs[b]!;
        if (!sameLocalDay(rows[ia]!, rows[ib]!)) continue;
        union(ia, ib);
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (find(i) === find(j)) continue;
      if (!listingsSoftDuplicateMatch(rows[i]!, rows[j]!)) continue;
      union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(rows[i]!);
    groups.set(root, list);
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    out.push(mergeOccurrenceGroup(group));
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
  T extends SoftCarrier & { source: string; sourceEventId: string },
>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const tz = row.timezone ?? "America/Los_Angeles";
    const key = occurrenceGroupKey(row.title, row.venueName, row.startsAt, tz);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const exact: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      exact.push(group[0]!);
      continue;
    }

    const merged = mergeOccurrenceGroup(group);
    exact.push({
      ...merged,
      // Keep native TM id — never `${source}:${groupKey}`
      sourceEventId: pickCanonical(group).sourceEventId,
    });
  }

  return coalesceSoftDuplicates(exact).map((row) => {
    // Soft merge may have picked a different canonical; keep that native id.
    return row;
  });
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
  T extends SoftCarrier & { source: string; sourceEventId: string },
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
  T extends SoftCarrier & { source: string; sourceEventId: string },
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

/**
 * Do312 (and similar calendars): soft-coalesce dual listings, then orphan GC.
 */
export function finalizeSoftCoalesceEvents<
  T extends SoftCarrier & { source: string; sourceEventId: string },
>(rows: T[]): {
  events: T[];
  orphans: { source: string; sourceEventId: string }[];
} {
  const coalesced = coalesceNormalizedOccurrences(rows);
  const keep = new Set(coalesced.map((r) => r.sourceEventId));
  const orphanMap = new Map<string, string>();

  for (const id of collectCoalesceOrphanIds(coalesced)) {
    const source =
      rows.find((r) => r.sourceEventId === id)?.source ??
      coalesced.find((r) => r.sourceEventId === id)?.source ??
      rows[0]?.source ??
      "do312";
    orphanMap.set(id, source);
  }
  for (const row of rows) {
    if (!keep.has(row.sourceEventId)) {
      orphanMap.set(row.sourceEventId, row.source);
    }
  }

  return {
    events: coalesced,
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
