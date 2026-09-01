"use client";

import { useMemo } from "react";
import type { EventDetail } from "./types";
import { EventDetailLocationMap } from "./EventDetailLocationMap";
import {
  eventHasLocation,
  eventMapCoords,
  mapsAppleDirectionsLink,
  mapsDirectionsLink,
} from "@/lib/event-location";

type Props = {
  event: Pick<
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
};

function useDirectionsHref(
  event: Props["event"],
): string | null {
  return useMemo(() => {
    if (!eventHasLocation(event)) return null;
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) {
        return mapsAppleDirectionsLink(event) ?? mapsDirectionsLink(event);
      }
    }
    return mapsDirectionsLink(event);
  }, [event]);
}

function DirectionsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M4.5 9.5L9.5 4.5M9.5 4.5H5.75M9.5 4.5V8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EventDetailLocation({ event }: Props) {
  if (!eventHasLocation(event)) return null;

  const coords = eventMapCoords(event);
  const directionsHref = useDirectionsHref(event);
  const mapLabel = event.venueName ?? event.title ?? "Event location";

  return (
    <div className="detail-body__location">
      {event.venueName ? (
        <p className="detail-body__venue-name">{event.venueName}</p>
      ) : null}
      <div className="detail-body__location-meta">
        {event.neighborhood ? (
          <span className="badge neighborhood">{event.neighborhood}</span>
        ) : null}
        {event.address ? (
          <span className="meta detail-body__address">{event.address}</span>
        ) : null}
      </div>
      {coords ? (
        <div className="detail-body__map-block">
          <EventDetailLocationMap
            lat={coords.lat}
            lng={coords.lng}
            label={mapLabel}
          />
          {directionsHref ? (
            <div className="detail-body__map-actions">
              <a
                className="detail-body__directions-link"
                href={directionsHref}
                target="_blank"
                rel="noreferrer"
              >
                Directions
                <DirectionsIcon />
              </a>
            </div>
          ) : null}
        </div>
      ) : directionsHref ? (
        <div className="detail-body__map-actions">
          <a
            className="detail-body__directions-link"
            href={directionsHref}
            target="_blank"
            rel="noreferrer"
          >
            Directions
            <DirectionsIcon />
          </a>
        </div>
      ) : null}
    </div>
  );
}
