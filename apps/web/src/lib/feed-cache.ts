import type { FeedCard } from "@bored/shared";
import { api } from "@/lib/api";

/** Match API Today feed cache TTL (feedCache.ts). */
const CACHE_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 50;

type CacheEntry = { at: number; cards: FeedCard[] };
const store = new Map<string, CacheEntry>();

export type FeedVideosMode = "include" | "exclude" | "only";

export function feedRequestCacheKey(params: URLSearchParams): string {
  const parts: string[] = [];
  for (const key of [...params.keys()].sort()) {
    parts.push(`${key}=${params.get(key)}`);
  }
  return parts.join("&");
}

export function peekFeedCache(params: URLSearchParams): FeedCard[] | null {
  const hit = store.get(feedRequestCacheKey(params));
  if (!hit) return null;
  if (Date.now() - hit.at >= CACHE_MS) {
    store.delete(feedRequestCacheKey(params));
    return null;
  }
  return hit.cards;
}

function putFeedCache(key: string, cards: FeedCard[]): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { at: Date.now(), cards });
}

export async function fetchFeedCached(
  params: URLSearchParams,
  opts?: { force?: boolean },
): Promise<{ cards: FeedCard[] }> {
  const key = feedRequestCacheKey(params);
  if (!opts?.force) {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return { cards: hit.cards };
    }
  }
  const data = await api<{ cards: FeedCard[] }>(
    `/v1/feed?${params.toString()}`,
  );
  putFeedCache(key, data.cards);
  return data;
}

/** Clone params with an explicit progressive `videos=` mode. */
export function feedParamsWithVideos(
  base: URLSearchParams,
  videos: FeedVideosMode,
): URLSearchParams {
  const next = new URLSearchParams(base);
  next.set("videos", videos);
  return next;
}

/** Unfiltered All params (same mode/area/date/limit/sources, no topics). */
export function feedParamsWithoutTopics(
  base: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(base);
  next.delete("topics");
  return next;
}

/** Home "All events" shape — used to warm-start Map without a cold refetch. */
export const FEED_ALL_EVENTS_LIMIT = 200;
/** Map denser coverage when All looks capped at FEED_ALL_EVENTS_LIMIT. */
export const FEED_MAP_TOPUP_LIMIT = 500;

export function feedAllEventsParams(opts: {
  mode: string;
  area: string;
  sources?: readonly string[];
  date?: string | null;
  limit?: number;
}): URLSearchParams {
  const params = new URLSearchParams({
    mode: opts.mode,
    area: opts.area,
    limit: String(opts.limit ?? FEED_ALL_EVENTS_LIMIT),
    videos: "exclude",
  });
  if (opts.sources?.length) params.set("sources", opts.sources.join(","));
  if (opts.date) params.set("date", opts.date);
  return params;
}

/** Prefer newer/longer list; keep first occurrence of each id. */
export function mergeFeedCardsById(
  primary: FeedCard[],
  extra: FeedCard[],
): FeedCard[] {
  if (!extra.length) return primary;
  if (!primary.length) return extra;
  const seen = new Set<string>();
  const out: FeedCard[] = [];
  for (const card of extra) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  for (const card of primary) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}
