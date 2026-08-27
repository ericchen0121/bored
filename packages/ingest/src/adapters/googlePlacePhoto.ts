import { fetchJson } from "../types.js";

type PlaceSearchResponse = {
  places?: {
    photos?: { name?: string }[];
  }[];
};

/**
 * Optional hero image from Google Places when editorial sources lack one.
 * Requires GOOGLE_MAPS_API_KEY (Places API New enabled).
 */
export async function fetchGooglePlacePhoto(opts: {
  venueName?: string | null;
  address?: string | null;
  neighborhood?: string | null;
}): Promise<string | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;

  const query = [opts.venueName, opts.address, opts.neighborhood, "San Francisco"]
    .filter(Boolean)
    .join(", ")
    .trim();
  if (!query) return null;

  try {
    const data = await fetchJson<PlaceSearchResponse>(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.photos",
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      },
    );

    const photoName = data.places?.[0]?.photos?.[0]?.name;
    if (!photoName) return null;

    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&key=${encodeURIComponent(key)}`;
    const res = await fetch(mediaUrl, { redirect: "follow" });
    if (!res.ok) return null;
    return res.url || null;
  } catch (err) {
    console.warn("[googlePlacePhoto] failed:", (err as Error).message);
    return null;
  }
}
