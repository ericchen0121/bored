"use client";

import { Marker } from "react-map-gl/mapbox";
import type { FeedCard } from "@bored/shared";
import { TypeIcon } from "@/components/EventPosterMedia";
import { cardEventType } from "@/lib/evergreen-poster";

type Props = {
  card: FeedCard;
};

export function MapSelectedEventMarker({ card }: Props) {
  const lat = card.lat;
  const lng = card.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  const eventType = cardEventType(card);

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      className="map-selected-marker"
    >
      <div className="map-selected-marker__stack">
        <div className="map-selected-marker__card">
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- map marker thumb
            <img
              src={card.imageUrl}
              alt=""
              className="map-selected-marker__img"
            />
          ) : (
            <div className="map-selected-marker__fallback">
              <TypeIcon kind={eventType.kind} />
            </div>
          )}
        </div>
        <span className="map-selected-marker__pin" aria-hidden />
      </div>
    </Marker>
  );
}
