import {
  CHI_DEFAULT,
  CURATED_NEW_RESTAURANTS,
  newRestaurantSourceLabel,
  SF_DEFAULT,
  suggestionStartsAt,
  type CuratedNewRestaurant,
} from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const TIMEZONE_BY_CITY: Record<string, string> = {
  sf: SF_DEFAULT.timezone,
  chicago: CHI_DEFAULT.timezone,
};

function timezoneForCity(city: string): string {
  return TIMEZONE_BY_CITY[city] ?? SF_DEFAULT.timezone;
}

function materializeNewRestaurant(
  restaurant: CuratedNewRestaurant,
): NormalizedEvent {
  const sourceEventId = contentHash([
    "new_restaurants",
    restaurant.city,
    restaurant.id,
  ]);
  const cuisineTag = restaurant.cuisine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  return {
    source: "new_restaurants",
    sourceEventId,
    kind: "recommendation",
    title: restaurant.title,
    description: `${restaurant.hook}. ${restaurant.description}`.slice(0, 1500),
    startsAt: suggestionStartsAt(sourceEventId, null),
    timezone: timezoneForCity(restaurant.city),
    venueName: restaurant.venueName,
    address: restaurant.address ?? null,
    neighborhood: restaurant.neighborhood ?? null,
    lat: restaurant.lat ?? null,
    lng: restaurant.lng ?? null,
    city: restaurant.city,
    priceMin: restaurant.priceMin ?? null,
    priceMax: restaurant.priceMax ?? null,
    isFree: false,
    categories: ["food"],
    tags: [
      "new_restaurant",
      "new_opening",
      cuisineTag,
      ...restaurant.sources,
    ].filter(Boolean),
    url: restaurant.url ?? restaurant.googleMapsUrl ?? null,
    organizer: restaurant.sources
      .map((s) => newRestaurantSourceLabel(s))
      .join(", "),
    rawPayload: {
      restaurantId: restaurant.id,
      cuisine: restaurant.cuisine,
      hook: restaurant.hook,
      sources: restaurant.sources,
      openedAt: restaurant.openedAt ?? null,
      googleMapsUrl: restaurant.googleMapsUrl ?? null,
      rating: restaurant.rating ?? null,
    },
  };
}

/** Curated new restaurant openings — SF + Chicago editorial picks */
export const newRestaurantsAdapter: SourceAdapter = {
  id: "new_restaurants",
  description:
    "Curated new restaurant openings — Infatuation, Eater, SF Standard, Reddit, blogs",
  async fetch() {
    const events = CURATED_NEW_RESTAURANTS.map(materializeNewRestaurant);
    return { events, replaceForSource: "new_restaurants" };
  },
};

export { materializeNewRestaurant };
