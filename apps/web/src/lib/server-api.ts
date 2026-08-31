import type { FeedCard } from "@bored/shared";
import { apiBaseUrl } from "@/lib/site";

type ServerFetchInit = {
  revalidate?: number | false;
};

async function serverGet<T>(
  path: string,
  init?: ServerFetchInit,
): Promise<T | null> {
  try {
    const revalidate = init?.revalidate ?? 300;
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
      next: revalidate === false ? { revalidate: 0 } : { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
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

/** Upcoming event + film detail URLs for sitemap.xml. */
export function fetchSitemapEntries(): Promise<SitemapPayload | null> {
  return serverGet<SitemapPayload>("/v1/seo/sitemap?limit=5000", {
    revalidate: 3600,
  });
}
