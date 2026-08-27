import {
  activityTipFallbackLabel,
  foodTipFallbackLabel,
  isActivityRecommendationSource,
  isFoodRecommendationSource,
  isNewRestaurantRecommendationSource,
  newRestaurantTipFallbackLabel,
  primaryEventType,
  type FeedCard,
} from "@bored/shared";

export function posterPlaceholderLabel(
  card: Pick<
    FeedCard,
    | "categories"
    | "tags"
    | "venueName"
    | "kind"
    | "recommendationLabel"
  > & {
    source?: string | null;
  },
): string {
  const source = card.source ?? "";
  if (isActivityRecommendationSource(source)) {
    return card.recommendationLabel?.trim() || "Things to do";
  }
  if (isNewRestaurantRecommendationSource(source)) {
    return newRestaurantTipFallbackLabel(card.recommendationLabel);
  }
  if (isFoodRecommendationSource(source, card.categories)) {
    return foodTipFallbackLabel(card.recommendationLabel);
  }
  return primaryEventType({
    categories: card.categories,
    tags: card.tags,
    venueName: card.venueName,
    source: card.source,
    kind: card.kind,
  }).label;
}

export function cardEventType(
  card: Pick<
    FeedCard,
    "categories" | "tags" | "venueName" | "kind"
  > & {
    source?: string | null;
  },
) {
  return primaryEventType({
    categories: card.categories,
    tags: card.tags,
    venueName: card.venueName,
    source: card.source,
    kind: card.kind,
  });
}
