import {
  CHI_DEFAULT,
  SF_DEFAULT,
  defaultAreaForCity,
  type FeedArea,
  type FeedCity,
} from "./taxonomy";

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const METRO_CENTERS: ReadonlyArray<{
  city: FeedCity;
  lat: number;
  lng: number;
}> = [
  { city: "sf", lat: SF_DEFAULT.lat, lng: SF_DEFAULT.lng },
  { city: "chicago", lat: CHI_DEFAULT.lat, lng: CHI_DEFAULT.lng },
];

/** Nearest supported feed metro to a lat/lng point. */
export function nearestFeedCity(lat: number, lng: number): FeedCity {
  let best: FeedCity = "sf";
  let bestMiles = Number.POSITIVE_INFINITY;
  for (const m of METRO_CENTERS) {
    const miles = haversineMiles(lat, lng, m.lat, m.lng);
    if (miles < bestMiles) {
      bestMiles = miles;
      best = m.city;
    }
  }
  return best;
}

export function feedAreaForCoords(lat: number, lng: number): FeedArea {
  return defaultAreaForCity(nearestFeedCity(lat, lng));
}

/**
 * Map IANA timezone → feed city when coords/IP are unavailable.
 * Only maps zones that clearly belong to a supported metro.
 */
export function feedCityFromTimeZone(
  timeZone: string | null | undefined,
): FeedCity | null {
  if (!timeZone) return null;
  if (timeZone === "America/Chicago") return "chicago";
  if (
    timeZone === "America/Los_Angeles" ||
    timeZone === "America/Vancouver"
  ) {
    return "sf";
  }
  return null;
}
