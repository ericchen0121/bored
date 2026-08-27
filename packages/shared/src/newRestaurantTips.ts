/**
 * New restaurant recommendations — evergreen feed rows sourced from editorial
 * guides, blogs, Reddit threads, and maps listings.
 */

import type { NewRestaurantSource } from "./newRestaurants.js";

const SOURCE_LABELS: Record<NewRestaurantSource, string> = {
  infatuation: "Infatuation",
  eater_sf: "Eater SF",
  eater_chi: "Eater Chicago",
  sf_standard: "SF Standard",
  sf_chronicle: "SF Chronicle",
  reddit: "Reddit",
  instagram: "Instagram",
  yelp: "Yelp",
  google_maps: "Google Maps",
  blog: "Local press",
  citycast: "City Cast",
};

/** Primary provenance label for feed/detail badges */
export function newRestaurantSourceLabel(
  source: NewRestaurantSource | string,
): string {
  return SOURCE_LABELS[source as NewRestaurantSource] ?? source.replace(/_/g, " ");
}

export function isNewRestaurantSource(source: string): boolean {
  return source === "new_restaurants";
}

/** Feed/detail framing: `New · Thai`, `Eater SF · Basque` */
export function newRestaurantRecommendationLabel(opts: {
  rawPayload?: {
    cuisine?: unknown;
    sources?: unknown;
    hook?: unknown;
  } | null;
}): string | null {
  const payload = opts.rawPayload ?? null;
  const cuisine =
    typeof payload?.cuisine === "string" ? payload.cuisine.trim() : null;
  const sources = Array.isArray(payload?.sources)
    ? payload.sources.filter((s): s is NewRestaurantSource => typeof s === "string")
    : [];
  const primary = sources[0] ? newRestaurantSourceLabel(sources[0]) : null;

  if (primary && cuisine) return `${primary} · ${cuisine}`;
  if (cuisine) return `New · ${cuisine}`;
  if (primary) return `${primary} · New opening`;
  return null;
}

export function newRestaurantTipFallbackLabel(
  recommendationLabel: string | null | undefined,
): string {
  if (recommendationLabel?.trim()) return recommendationLabel.trim();
  return "New restaurant";
}

/** New restaurants share untimed recommendation UX with food/activity tips */
export function isNewRestaurantRecommendationSource(
  source: string | null | undefined,
): boolean {
  return source === "new_restaurants";
}
