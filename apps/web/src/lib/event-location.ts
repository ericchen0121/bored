import type { EventDetail } from "@/components/detail/types";

type LocatableEvent = Pick<
  EventDetail,
  "venueName" | "address" | "neighborhood" | "lat" | "lng" | "rawPayload"
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

/** Build a geocodable query for Google Maps (coords preferred, then venue + address). */
export function eventLocationQuery(event: LocatableEvent): string | null {
  if (event.lat != null && event.lng != null) {
    return `${event.lat},${event.lng}`;
  }

  const parts = [event.venueName?.trim(), event.address?.trim()].filter(Boolean);
  if (parts.length) return parts.join(", ");

  return null;
}

export function googleMapsEmbedSrc(event: LocatableEvent): string | null {
  const query = eventLocationQuery(event);
  if (!query) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}

export function googleMapsLink(event: LocatableEvent): string | null {
  const fromPayload = partifulGoogleMapsUrl(event.rawPayload);
  if (fromPayload) return fromPayload;

  const query = eventLocationQuery(event);
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
