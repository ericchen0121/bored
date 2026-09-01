import {
  FEED_TOPIC_LABELS,
  type FeedArea,
  type FeedTopic,
} from "@bored/shared";

/** Metro-flavored feed loading line (see docs/city-seeding.md). */
export function gatheringPhraseForArea(area: FeedArea): string {
  if (area === "chicago") return "Gathering the wind…";
  if (area === "la") return "Gathering the haze…";
  return "Gathering the fog…";
}

/** Map loading pill: city name + metro gathering line. */
export function mapLoadingPhrase(area: FeedArea, cityLabel: string): string {
  return `${cityLabel} · ${gatheringPhraseForArea(area)}`;
}

/** Status copy while an existing feed refreshes for new filters. */
export function feedRefreshPhrase(
  area: FeedArea,
  topics: FeedTopic[],
): string {
  if (topics.length === 1) {
    return `Loading ${FEED_TOPIC_LABELS[topics[0]]}…`;
  }
  if (topics.length > 1) {
    return "Loading topics…";
  }
  return gatheringPhraseForArea(area);
}
