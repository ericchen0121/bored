import {
  defaultAreaForCity,
  feedAreaForCoords,
  feedCityFromTimeZone,
  type FeedArea,
} from "@bored/shared";
import { api } from "@/lib/api";

type GeoResponse = {
  city: string;
  area: FeedArea;
  lat: number | null;
  lng: number | null;
  source: "coords" | "ip" | "default";
};

function readBrowserCoords(timeoutMs = 8000): Promise<{
  lat: number;
  lng: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
    );
  });
}

function browserCoordsIfGranted(
  timeoutMs = 2500,
): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  const permissions = navigator.permissions;
  if (!permissions?.query) {
    // No Permissions API — skip prompting; IP/timezone handle cold start.
    return Promise.resolve(null);
  }

  return permissions
    .query({ name: "geolocation" })
    .then((status) =>
      status.state === "granted" ? readBrowserCoords(timeoutMs) : null,
    )
    .catch(() => null);
}

/**
 * Pick a feed area for first visit: browser coords (if already granted) →
 * API IP lookup → timezone heuristic → SF Bay.
 */
export async function detectFeedArea(): Promise<FeedArea> {
  const coords = await browserCoordsIfGranted();
  if (coords) {
    return feedAreaForCoords(coords.lat, coords.lng);
  }

  try {
    const geo = await api<GeoResponse>("/v1/geo");
    if (geo.source !== "default") return geo.area;
  } catch {
    /* fall through */
  }

  const fromTz = feedCityFromTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  if (fromTz) return defaultAreaForCity(fromTz);

  return defaultAreaForCity("sf");
}

/**
 * Explicit “use my location” — prompts for geolocation, then falls back to IP.
 * Throws when neither path can resolve a metro.
 */
export async function requestFeedAreaFromLocation(): Promise<FeedArea> {
  const coords = await readBrowserCoords();
  if (coords) {
    return feedAreaForCoords(coords.lat, coords.lng);
  }

  try {
    const geo = await api<GeoResponse>("/v1/geo");
    if (geo.source !== "default") return geo.area;
  } catch {
    /* fall through */
  }

  throw new Error("location_unavailable");
}
