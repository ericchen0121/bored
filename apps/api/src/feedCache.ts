/** Short-TTL in-memory cache for shared (anonymous) Today feeds. */

type CacheEntry = {
  expiresAt: number;
  body: unknown;
};

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 90_000;
const MAX_ENTRIES = 200;

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
  ttlMs = DEFAULT_TTL_MS,
): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { body, expiresAt: Date.now() + ttlMs });
}
