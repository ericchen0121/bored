"use client";

import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

type Props = {
  lat: number;
  lng: number;
  label?: string | null;
};

export function EventDetailLocationMap({ lat, lng, label }: Props) {
  if (!TOKEN) return null;

  return (
    <div className="detail-body__map-frame detail-body__map-frame--mapbox">
      <Map
        mapboxAccessToken={TOKEN}
        initialViewState={{
          longitude: lng,
          latitude: lat,
          zoom: 14.2,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        dragPan={false}
        dragRotate={false}
        scrollZoom={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        keyboard={false}
        attributionControl={false}
      >
        <Marker longitude={lng} latitude={lat} anchor="bottom">
          <span
            className="detail-body__map-pin"
            title={label ?? undefined}
            aria-hidden
          />
        </Marker>
      </Map>
    </div>
  );
}
