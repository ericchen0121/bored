/** In-memory cache for shared Today feeds (all users — personalization is overlaid per request). */

type CacheEntry = {
  expiresAt: number;
  body: unknown;
};

const store = new Map<string, CacheEntry>();
/** Default 15m — long enough to absorb traffic; short enough to limit RSS on small VMs. */
export const DEFAULT_TODAY_FEED_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 24;
/** Map uses limit=500; skip caching large payloads to avoid OOM on Railway. */
export const TODAY_FEED_CACHE_MAX_LIMIT = 200;

export function shouldCacheTodayFeed(limit: number): boolean {
  return limit > 0 && limit <= TODAY_FEED_CACHE_MAX_LIMIT;
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

export function todayFeedCacheTtlMs(): number {
  const raw = process.env.TODAY_FEED_CACHE_TTL_MS?.trim();
  if (!raw) return DEFAULT_TODAY_FEED_CACHE_TTL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TODAY_FEED_CACHE_TTL_MS;
  return n;
}

export function todayFeedCacheKey(parts: {
  area: string;
  date: string | null | undefined;
  topics: string;
  sources: string;
  limit: number;
}): string {
  return [
    "today",
    parts.area,
    parts.date ?? "",
    parts.topics,
    parts.sources,
    String(parts.limit),
  ].join("|");
}

export function getTodayFeedCache(key: string): unknown | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.body;
}

export function setTodayFeedCache(
  key: string,
  body: unknown,
  ttlMs = todayFeedCacheTtlMs(),
): void {
  purgeExpired();
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { body, expiresAt: Date.now() + ttlMs });
}
