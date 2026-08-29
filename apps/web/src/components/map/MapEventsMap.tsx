"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import type { FeedCard, FeedCity } from "@bored/shared";
import { CHI_DEFAULT, SF_DEFAULT } from "@bored/shared";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

const CITY_VIEW: Record<
  FeedCity,
  { longitude: number; latitude: number; zoom: number }
> = {
  sf: {
    longitude: SF_DEFAULT.lng,
    latitude: SF_DEFAULT.lat,
    zoom: 11.2,
  },
  chicago: {
    longitude: CHI_DEFAULT.lng,
    latitude: CHI_DEFAULT.lat,
    zoom: 11,
  },
};

const CLUSTER_COLOR = "#e8a54b";
const CLUSTER_COLOR_ACTIVE = "#ffc15e";
const PIN_COLOR = "#e8a54b";
const PIN_COLOR_ACTIVE = "#ffc15e";
const CLUSTER_TEXT = "#1a1208";

const CLUSTER_LAYER = "bored-clusters";
const CLUSTER_COUNT_LAYER = "bored-cluster-count";
const UNCLUSTERED_LAYER = "bored-unclustered";

type Props = {
  city: FeedCity;
  cards: FeedCard[];
  selectedId: string | null;
  selectedClusterId: number | null;
  onClusterFilter: (ids: string[], clusterId: number) => void;
  onSelectEvent: (id: string) => void;
};

type MapFeature = {
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: number[] } | null;
};

function featureId(f: MapFeature): string | null {
  const id = f.properties?.id;
  return typeof id === "string" ? id : id != null ? String(id) : null;
}

function featureClusterId(f: MapFeature): number | null {
  const id = f.properties?.cluster_id;
  return typeof id === "number" ? id : null;
}

function featurePoint(f: MapFeature): { lng: number; lat: number } | null {
  const g = f.geometry;
  if (!g || g.type !== "Point" || !g.coordinates) return null;
  const [lng, lat] = g.coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  return { lng, lat };
}

function cardsToGeoJSON(cards: FeedCard[]) {
  return {
    type: "FeatureCollection" as const,
    features: cards
      .filter(
        (c) =>
          typeof c.lat === "number" &&
          typeof c.lng === "number" &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng),
      )
      .map((c) => ({
        type: "Feature" as const,
        properties: {
          id: c.id,
          title: c.title,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [c.lng as number, c.lat as number],
        },
      })),
  };
}

function getClusterLeaves(
  source: GeoJSONSource,
  clusterId: number,
): Promise<MapFeature[]> {
  return new Promise((resolve, reject) => {
    source.getClusterLeaves(clusterId, 500, 0, (err, feats) => {
      if (err) reject(err);
      else resolve((feats ?? []) as MapFeature[]);
    });
  });
}

export function MapEventsMap({
  city,
  cards,
  selectedId,
  selectedClusterId,
  onClusterFilter,
  onSelectEvent,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const geojson = useMemo(() => cardsToGeoJSON(cards), [cards]);
  const initialView = CITY_VIEW[city];

  const resizeMap = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.resize();
  }, []);

  // Client navigations often mount Mapbox before the flex layout finishes
  // (sidebar width, shell full-bleed). Resize whenever the pane changes size.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    resizeMap();
    const ro = new ResizeObserver(() => {
      resizeMap();
    });
    ro.observe(pane);

    // Extra passes after layout/fonts settle (SPA entry from feed).
    const t1 = window.setTimeout(resizeMap, 0);
    const t2 = window.setTimeout(resizeMap, 100);
    const t3 = window.setTimeout(resizeMap, 400);

    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [resizeMap, city]);

  // Keep paint/layout expressions reactive when highlight changes.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map?.getLayer(CLUSTER_LAYER)) return;
    const active = selectedClusterId ?? -1;
    map.setPaintProperty(CLUSTER_LAYER, "circle-radius", [
      "case",
      ["==", ["get", "cluster_id"], active],
      26,
      18,
    ]);
    map.setPaintProperty(CLUSTER_LAYER, "circle-color", [
      "case",
      ["==", ["get", "cluster_id"], active],
      CLUSTER_COLOR_ACTIVE,
      CLUSTER_COLOR,
    ]);
    map.setPaintProperty(CLUSTER_LAYER, "circle-stroke-width", [
      "case",
      ["==", ["get", "cluster_id"], active],
      3,
      2,
    ]);
    if (map.getLayer(CLUSTER_COUNT_LAYER)) {
      map.setLayoutProperty(CLUSTER_COUNT_LAYER, "text-size", [
        "case",
        ["==", ["get", "cluster_id"], active],
        15,
        13,
      ]);
    }
  }, [selectedClusterId]);

  const onClick = useCallback(
    async (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap() as MapboxMap | undefined;
      if (!map) return;

      const unclustered = map.queryRenderedFeatures(e.point, {
        layers: [UNCLUSTERED_LAYER],
      }) as MapFeature[];
      const pinId = unclustered[0] ? featureId(unclustered[0]) : null;
      if (pinId) {
        onSelectEvent(pinId);
        return;
      }

      const clusters = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      }) as MapFeature[];
      const cluster = clusters[0];
      if (!cluster) return;

      const clusterId = featureClusterId(cluster);
      const point = featurePoint(cluster);
      if (clusterId == null || !point) return;

      const source = map.getSource("bored-events") as GeoJSONSource;
      const leaves = await getClusterLeaves(source, clusterId);
      const ids = leaves
        .map((f) => featureId(f))
        .filter((id): id is string => Boolean(id));
      onClusterFilter(ids, clusterId);

      map.easeTo({
        center: [point.lng, point.lat],
        duration: 450,
      });
    },
    [onClusterFilter, onSelectEvent],
  );

  const onMouseEnter = useCallback((e: MapMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const hit = map.queryRenderedFeatures(e.point, {
      layers: [CLUSTER_LAYER, UNCLUSTERED_LAYER],
    });
    map.getCanvas().style.cursor = hit.length ? "pointer" : "";
  }, []);

  const onMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
  }, []);

  if (!TOKEN) {
    return (
      <div className="map-pane map-pane--missing-token">
        <p>
          Add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to <code>.env</code>{" "}
          and restart the web app to load the map.
        </p>
      </div>
    );
  }

  const activeCluster = selectedClusterId ?? -1;

  return (
    <div className="map-pane" ref={paneRef}>
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={initialView}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={[CLUSTER_LAYER, UNCLUSTERED_LAYER]}
        onClick={onClick}
        onMouseMove={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onLoad={resizeMap}
        attributionControl={false}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source
          id="bored-events"
          type="geojson"
          data={geojson}
          cluster
          clusterMaxZoom={14}
          clusterRadius={52}
        >
          <Layer
            id={CLUSTER_LAYER}
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "case",
                ["==", ["get", "cluster_id"], activeCluster],
                CLUSTER_COLOR_ACTIVE,
                CLUSTER_COLOR,
              ],
              "circle-stroke-width": [
                "case",
                ["==", ["get", "cluster_id"], activeCluster],
                3,
                2,
              ],
              "circle-stroke-color": "rgba(12, 14, 18, 0.85)",
              "circle-radius": [
                "case",
                ["==", ["get", "cluster_id"], activeCluster],
                26,
                18,
              ],
            }}
          />
          <Layer
            id={CLUSTER_COUNT_LAYER}
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["to-string", ["get", "point_count"]],
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
              "text-size": [
                "case",
                ["==", ["get", "cluster_id"], activeCluster],
                15,
                13,
              ],
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": CLUSTER_TEXT,
            }}
          />
          <Layer
            id={UNCLUSTERED_LAYER}
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": [
                "case",
                ["==", ["get", "id"], selectedId ?? ""],
                PIN_COLOR_ACTIVE,
                PIN_COLOR,
              ],
              "circle-radius": [
                "case",
                ["==", ["get", "id"], selectedId ?? ""],
                9,
                7,
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(12, 14, 18, 0.9)",
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
