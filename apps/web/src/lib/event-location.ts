import type { EventDetail } from "@/components/detail/types";
import { resolveEventCoords } from "@bored/shared";

type LocatableEvent = Pick<
  EventDetail,
  | "venueName"
  | "address"
  | "neighborhood"
  | "lat"
  | "lng"
  | "title"
  | "city"
  | "rawPayload"
>;

/** True when the event has any place info worth showing (venue, address, coords, or neighborhood). */
export function eventHasLocation(event: LocatableEvent): boolean {
  return Boolean(
    event.venueName?.trim() ||
      event.address?.trim() ||
      event.neighborhood?.trim() ||
      (event.lat != null && event.lng != null),
  );
}

/** Resolved coords for map pin (venue geo lookup when lat/lng missing). */
export function eventMapCoords(
  event: LocatableEvent,
): { lat: number; lng: number } | null {
  const resolved = resolveEventCoords({
    lat: event.lat,
    lng: event.lng,
    venueName: event.venueName,
    title: event.title,
    address: event.address,
    city: event.city,
    neighborhood: event.neighborhood,
  });
  if (resolved.lat == null || resolved.lng == null) return null;
  return { lat: resolved.lat, lng: resolved.lng };
}

/** Build a geocodable query for maps (coords preferred, then venue + address). */
export function eventLocationQuery(event: LocatableEvent): string | null {
  const coords = eventMapCoords(event);
  if (coords) {
    return `${coords.lat},${coords.lng}`;
  }

  const parts = [event.venueName?.trim(), event.address?.trim()].filter(Boolean);
  if (parts.length) return parts.join(", ");

  if (event.neighborhood?.trim()) return event.neighborhood.trim();

  return null;
}

/** Turn-by-turn directions — opens the native maps app on mobile when installed. */
export function mapsDirectionsLink(event: LocatableEvent): string | null {
  const fromPayload = partifulGoogleMapsUrl(event.rawPayload);
  if (fromPayload) return fromPayload;

  const query = eventLocationQuery(event);
  if (!query) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

/** Apple Maps directions (preferred on iPhone / iPad). */
export function mapsAppleDirectionsLink(event: LocatableEvent): string | null {
  const query = eventLocationQuery(event);
  if (!query) return null;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(query)}&dirflg=d`;
}

export function googleMapsEmbedSrc(event: LocatableEvent): string | null {
  const query = eventLocationQuery(event);
  if (!query) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}

/** @deprecated Prefer mapsDirectionsLink */
export function googleMapsLink(event: LocatableEvent): string | null {
  return mapsDirectionsLink(event);
}

function partifulGoogleMapsUrl(
  rawPayload: EventDetail["rawPayload"],
): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const locationInfo = (rawPayload as Record<string, unknown>).locationInfo;
  if (!locationInfo || typeof locationInfo !== "object") return null;
  const mapsInfo = (locationInfo as Record<string, unknown>).mapsInfo;
  if (!mapsInfo || typeof mapsInfo !== "object") return null;
  const url = (mapsInfo as Record<string, unknown>).googleMapsUrl;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}
