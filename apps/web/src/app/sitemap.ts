import type { MetadataRoute } from "next";
import { FEED_CITIES } from "@bored/shared";
import { fetchSitemapEntries } from "@/lib/server-api";
import { siteUrl } from "@/lib/site";
import { allTopicHubPaths } from "@/lib/topic-seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const cityEntries: MetadataRoute.Sitemap = FEED_CITIES.map((city) => ({
    url: `${base}/${city}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 1,
  }));

  const topicEntries: MetadataRoute.Sitemap = allTopicHubPaths().map(
    ({ city, topic }) => ({
      url: `${base}/${city}/${topic}`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.85,
    }),
  );

  const seo = await fetchSitemapEntries();
  const eventEntries: MetadataRoute.Sitemap = (seo?.events ?? []).map(
    (entry) => ({
      url: `${base}/events/${entry.id}`,
      lastModified: new Date(entry.lastModified),
      changeFrequency: "daily",
      priority: 0.7,
    }),
  );

  const filmEntries: MetadataRoute.Sitemap = (seo?.films ?? []).map((entry) => ({
    url: `${base}/movies/${entry.id}`,
    lastModified: new Date(entry.lastModified),
    changeFrequency: "weekly",
    priority: 0.65,
  }));

  return [...cityEntries, ...topicEntries, ...eventEntries, ...filmEntries];
}
