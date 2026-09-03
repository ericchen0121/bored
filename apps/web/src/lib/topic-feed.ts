import type { FeedCard, FeedTopic } from "@bored/shared";
import {
  FEED_TOPICS_NEED_SERVER_ENRICH,
  feedTopicsFullyCoveredByAll,
  feedTopicsNeedServerEnrich,
  matchesAnyFeedTopic,
} from "@bored/shared";

/** Prefetch after All paints so first chip click is a cache hit. */
export const TOPICS_TO_WARM: readonly FeedTopic[] = [
  "food",
  "happy_hours",
  "activities",
  "movies",
  "comedy",
];

export function topicNeedsServerEnrich(
  topics: readonly FeedTopic[],
): boolean {
  return feedTopicsNeedServerEnrich(topics);
}

export function topicsFullyCoveredByAll(
  topics: readonly FeedTopic[],
): boolean {
  return feedTopicsFullyCoveredByAll(topics);
}

export function filterCardsByTopics(
  cards: FeedCard[],
  topics: readonly FeedTopic[],
): FeedCard[] {
  if (!topics.length) return cards;
  return cards.filter((card) =>
    matchesAnyFeedTopic([...topics], {
      kind: card.kind,
      categories: card.categories ?? [],
      tags: card.tags,
      isFree: card.isFree,
      source: card.source,
      title: card.title,
      venueName: card.venueName,
    }),
  );
}

export { FEED_TOPICS_NEED_SERVER_ENRICH };
