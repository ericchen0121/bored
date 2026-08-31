import { FEED_CITIES, type FeedCity } from "@bored/shared";
import { cityShareLabel } from "@/lib/city-share";
import { buildEventsRss, rssResponse } from "@/lib/rss";
import { fetchCityHubFeed } from "@/lib/server-api";
import { topicHubArea } from "@/lib/topic-seo";

type Props = { params: Promise<{ city: string }> };

function parseCity(value: string): FeedCity | null {
  return FEED_CITIES.includes(value as FeedCity) ? (value as FeedCity) : null;
}

export async function GET(_request: Request, { params }: Props) {
  const { city: cityParam } = await params;
  const city = parseCity(cityParam);
  if (!city) {
    return new Response("Not found", { status: 404 });
  }

  const cityLabel = cityShareLabel(city);
  const data = await fetchCityHubFeed(topicHubArea(city), 40);
  const xml = buildEventsRss({
    city,
    cards: data?.cards ?? [],
    title: `Bored — things to do in ${cityLabel}`,
    description: `Upcoming events, comedy, movies, food, and activities in ${cityLabel}.`,
    selfPath: `/feed/${city}`,
  });
  return rssResponse(xml);
}
