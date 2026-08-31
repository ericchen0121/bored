import { FEED_CITIES, type FeedCity } from "@bored/shared";
import { buildEventsRss, rssResponse } from "@/lib/rss";
import { fetchTopicHubFeed } from "@/lib/server-api";
import {
  isFeedTopic,
  topicHubArea,
  topicHubIntroText,
  topicHubTitle,
} from "@/lib/topic-seo";

type Props = { params: Promise<{ city: string; topic: string }> };

function parseCity(value: string): FeedCity | null {
  return FEED_CITIES.includes(value as FeedCity) ? (value as FeedCity) : null;
}

export async function GET(_request: Request, { params }: Props) {
  const { city: cityParam, topic: topicParam } = await params;
  const city = parseCity(cityParam);
  const topic = isFeedTopic(topicParam) ? topicParam : null;
  if (!city || !topic) {
    return new Response("Not found", { status: 404 });
  }

  const data = await fetchTopicHubFeed(topicHubArea(city), topic, 40);
  const xml = buildEventsRss({
    city,
    topic,
    cards: data?.cards ?? [],
    title: `Bored — ${topicHubTitle(city, topic)}`,
    description: topicHubIntroText(city, topic),
    selfPath: `/feed/${city}/${topic}`,
  });
  return rssResponse(xml);
}
