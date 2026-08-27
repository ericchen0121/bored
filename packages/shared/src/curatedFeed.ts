import { isEvergreenRecommendationSource } from "./activityTips";
import { eventInArea, type FeedArea } from "./taxonomy";

/** Curated tips — fetched outside the timed startsAt window. */
export const CURATED_FEED_SOURCE_IDS = [
  "activities",
  "food",
  "food_deals",
  "new_restaurants",
  "instagram",
  "recurring",
] as const;

/**
 * Sources served only via the curated path (not timed SQL).
 * Instagram is excluded — non-food IG posts are real timed events.
 */
export const CURATED_ONLY_TIMED_SOURCES = [
  "food",
  "activities",
  "new_restaurants",
  "food_deals",
  "recurring",
] as const;

/** Drop evergreen tips not refreshed by ingest within this window. */
export const EVERGREEN_TIP_STALE_DAYS = 45;

export type CuratedFeedRowLike = {
  source: string;
  kind?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  categories?: string[] | null;
  lastSeenAt?: Date | string | null;
};

/** Scope curated rows to the requested metro and hide stale evergreen tips. */
export function filterCuratedFeedRows<T extends CuratedFeedRowLike>(
  rows: T[],
  area: FeedArea,
  opts?: { now?: Date; maxStaleDays?: number },
): T[] {
  const now = opts?.now ?? new Date();
  const maxStaleDays = opts?.maxStaleDays ?? EVERGREEN_TIP_STALE_DAYS;
  const staleCutoff = new Date(now.getTime() - maxStaleDays * 86400000);

  return rows.filter((row) => {
    if (
      !eventInArea(area, {
        city: row.city,
        neighborhood: row.neighborhood,
      })
    ) {
      return false;
    }
    if (
      isEvergreenRecommendationSource(row.source, row.categories, row.kind)
    ) {
      const seen = row.lastSeenAt ? new Date(row.lastSeenAt) : null;
      if (seen && seen < staleCutoff) return false;
    }
    return true;
  });
}
