import { cache } from "react";
import type { FeedCard } from "@bored/shared";
import { apiBaseUrl } from "@/lib/site";

type ServerFetchInit = {
  revalidate?: number | false;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

async function serverGet<T>(
  path: string,
  init?: ServerFetchInit,
): Promise<T | null> {
  if (isNextProductionBuild()) return null;

  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const revalidate = init?.revalidate ?? 300;
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: revalidate === false ? { revalidate: 0 } : { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type TopicHubFeed = {
  cards: FeedCard[];
};

export type SitemapEntry = {
  id: string;
  lastModified: string;
};

export type SitemapPayload = {
  events: SitemapEntry[];
  films: SitemapEntry[];
};

/** Upcoming listings for an SSR topic hub (`mode=all`, single topic). */
export function fetchTopicHubFeed(
  area: string,
  topic: string,
  limit = 50,
): Promise<TopicHubFeed | null> {
  const params = new URLSearchParams({
    mode: "all",
    area,
    topics: topic,
    limit: String(limit),
  });
  return serverGet<TopicHubFeed>(`/v1/feed?${params.toString()}`);
}

/** Deduped per-request (metadata + page component). */
export const getTopicHubFeed = cache(
  (area: string, topic: string, limit = 50) =>
    fetchTopicHubFeed(area, topic, limit),
);

/** City-wide upcoming listings (no topic filter) for RSS / llms-full. */
export function fetchCityHubFeed(
  area: string,
  limit = 40,
): Promise<TopicHubFeed | null> {
  const params = new URLSearchParams({
    mode: "all",
    area,
    limit: String(limit),
  });
  return serverGet<TopicHubFeed>(`/v1/feed?${params.toString()}`);
}

export const getCityHubFeed = cache(
  (area: string, limit = 40) => fetchCityHubFeed(area, limit),
);

/** Upcoming event + film detail URLs for sitemap.xml. */
export function fetchSitemapEntries(): Promise<SitemapPayload | null> {
  return serverGet<SitemapPayload>("/v1/seo/sitemap?limit=5000", {
    revalidate: 3600,
    timeoutMs: 45_000,
  });
}
