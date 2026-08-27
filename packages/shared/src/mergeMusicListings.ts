import { enrichCategoriesWithTags } from "./taxonomy";

/** Minimal fields needed to match and coalesce RA ↔ 19hz listings. */
export type MusicListingLike = {
  id: string;
  source: string;
  sourceEventId: string;
  url?: string | null;
  tags?: string[] | null;
  categories?: string[] | null;
  rawPayload?: unknown;
};

/**
 * Pull a Resident Advisor event id from a listing URL.
 * 19hz often links directly to `https://ra.co/events/{id}`.
 */
export function extractRaEventId(url: string | null | undefined): string | null {
  if (!url) return null;
  const fromPath = url.match(/(?:^|\/\/)(?:www\.)?ra\.co\/events\/(\d+)/i);
  if (fromPath?.[1]) return fromPath[1];
  try {
    const u = new URL(url);
    if (!/(^|\.)ra\.co$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/events\/(\d+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Stable key for exact-URL matching across sources. */
export function normalizeListingUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function tagKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Union tags with 19hz genres first (richer chips), then RA genres.
 */
export function mergeMusicTags(
  raTags: string[] | null | undefined,
  nineteenHzTags: string[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(nineteenHzTags ?? []), ...(raTags ?? [])]) {
    const key = tagKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

export function mergeRaWithNineteenHz<T extends MusicListingLike>(
  ra: T,
  nineteenHz: T,
): T {
  const tags = mergeMusicTags(ra.tags, nineteenHz.tags);
  const categories = enrichCategoriesWithTags(
    [...(ra.categories ?? [])],
    tags,
  );
  const raPayload =
    (ra.rawPayload as Record<string, unknown> | null | undefined) ?? {};
  return {
    ...ra,
    tags,
    categories,
    rawPayload: {
      ...raPayload,
      mergedFrom19hzId: nineteenHz.id,
      mergedFrom19hzTags: nineteenHz.tags ?? [],
    },
  };
}

function listingMatchKeys(event: MusicListingLike): string[] {
  const keys: string[] = [];
  if (event.source === "ra" && event.sourceEventId) {
    keys.push(`ra:${event.sourceEventId}`);
  }
  const fromUrl = extractRaEventId(event.url);
  if (fromUrl) keys.push(`ra:${fromUrl}`);
  const norm = normalizeListingUrl(event.url);
  if (norm) keys.push(`url:${norm}`);
  return keys;
}

/**
 * Prefer RA as the canonical listing when a 19hz row points at the same
 * RA event (usually via shared `ra.co/events/{id}` URL). Keep RA lineup /
 * flyer / copy; enrich tags (and derived music categories) from 19hz.
 *
 * Unmatched 19hz rows are kept. Non music-source rows pass through.
 */
export function coalesceRaNineteenHz<T extends MusicListingLike>(
  rows: T[],
): T[] {
  const raByKey = new Map<string, T>();
  for (const row of rows) {
    if (row.source !== "ra") continue;
    for (const key of listingMatchKeys(row)) {
      if (!raByKey.has(key)) raByKey.set(key, row);
    }
  }

  const suppressed19hz = new Set<string>();
  const enrichments = new Map<string, T[]>(); // ra.id → 19hz rows

  for (const row of rows) {
    if (row.source !== "19hz") continue;
    let matched: T | undefined;
    for (const key of listingMatchKeys(row)) {
      matched = raByKey.get(key);
      if (matched) break;
    }
    if (!matched) continue;
    suppressed19hz.add(row.id);
    const list = enrichments.get(matched.id) ?? [];
    list.push(row);
    enrichments.set(matched.id, list);
  }

  if (!suppressed19hz.size) return rows;

  const out: T[] = [];
  const emittedRa = new Set<string>();

  for (const row of rows) {
    if (row.source === "19hz" && suppressed19hz.has(row.id)) continue;

    if (row.source === "ra" && enrichments.has(row.id)) {
      if (emittedRa.has(row.id)) continue;
      emittedRa.add(row.id);
      const twins = enrichments.get(row.id)!;
      out.push(twins.reduce((acc, hz) => mergeRaWithNineteenHz(acc, hz), row));
      continue;
    }

    out.push(row);
  }

  return out;
}
