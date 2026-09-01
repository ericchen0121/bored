import type { FeedCard } from "@bored/shared";
import { api } from "@/lib/api";

/** Match API Today feed cache TTL (feedCache.ts). */
const CACHE_MS = 45 * 60 * 1000;
const MAX_ENTRIES = 50;

type CacheEntry = { at: number; cards: FeedCard[] };
const store = new Map<string, CacheEntry>();

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
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { at: Date.now(), cards: data.cards });
  return data;
}
