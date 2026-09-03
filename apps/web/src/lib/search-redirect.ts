import {
  FEED_CITIES,
  FEED_TOPIC_LABELS,
  FEED_TOPICS,
  type FeedCity,
  type FeedTopic,
} from "@bored/shared";
import { topicHubPath } from "@/lib/topic-seo";

const CITY_ALIASES: ReadonlyArray<{ match: string; city: FeedCity }> = [
  { match: "los angeles", city: "la" },
  { match: "san francisco", city: "sf" },
  { match: "bay area", city: "sf" },
  { match: "chicago", city: "chicago" },
  { match: "la", city: "la" },
  { match: "sf", city: "sf" },
];

const TOPIC_ALIASES: ReadonlyArray<{ match: string; topic: FeedTopic }> = [
  { match: "happy hour", topic: "happy_hours" },
  { match: "happy hours", topic: "happy_hours" },
  { match: "street festival", topic: "festivals" },
  { match: "street festivals", topic: "festivals" },
  { match: "things to do", topic: "activities" },
  { match: "stand up", topic: "comedy" },
  { match: "standup", topic: "comedy" },
  { match: "live music", topic: "concerts" },
  { match: "concert", topic: "concerts" },
  { match: "concerts", topic: "concerts" },
  { match: "music festival", topic: "music_festivals" },
  { match: "music festivals", topic: "music_festivals" },
  { match: "lollapalooza", topic: "music_festivals" },
  { match: "portola", topic: "music_festivals" },
  { match: "north coast", topic: "music_festivals" },
  { match: "arc festival", topic: "music_festivals" },
  { match: "comedy", topic: "comedy" },
  { match: "movie", topic: "movies" },
  { match: "movies", topic: "movies" },
  { match: "sport", topic: "sports" },
  { match: "sports", topic: "sports" },
  { match: "festival", topic: "festivals" },
  { match: "festivals", topic: "festivals" },
  { match: "free", topic: "free" },
  { match: "food", topic: "food" },
  { match: "nightlife", topic: "nightlife" },
  { match: "arts", topic: "arts" },
  { match: "theater", topic: "theater" },
  { match: "theatre", topic: "theater" },
  { match: "broadway", topic: "theater" },
  { match: "musical", topic: "theater" },
  { match: "play", topic: "theater" },
  { match: "activities", topic: "activities" },
];

function detectCity(query: string): FeedCity {
  for (const { match, city } of CITY_ALIASES) {
    if (query.includes(match)) return city;
  }
  return "sf";
}

function detectTopic(query: string): FeedTopic | null {
  for (const topic of FEED_TOPICS) {
    const label = FEED_TOPIC_LABELS[topic].toLowerCase();
    if (query.includes(label)) return topic;
  }
  for (const { match, topic } of TOPIC_ALIASES) {
    if (query.includes(match)) return topic;
  }
  return null;
}

/** Map a free-text search query to the best internal listing URL. */
export function resolveSearchQuery(raw: string): string {
  const query = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!query) return `/${FEED_CITIES[0]}`;

  const city = detectCity(query);
  const topic = detectTopic(query);
  if (topic) return topicHubPath(city, topic);
  return `/${city}`;
}
