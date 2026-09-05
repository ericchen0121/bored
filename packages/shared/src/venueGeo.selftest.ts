/**
 * Quick checks for feed-slug vs locality geocoding.
 *   pnpm exec tsx packages/shared/src/venueGeo.selftest.ts
 */
import { resolveEventCoords } from "./venueGeo";

function assert(
  cond: unknown,
  msg: string,
): asserts cond {
  if (!cond) throw new Error(msg);
}

function nearly(a: number, b: number, eps = 1e-3) {
  return Math.abs(a - b) < eps;
}

// Feed city=`sf` alone must not pin Market/Civic SF.
{
  const r = resolveEventCoords({ city: "sf" });
  assert(r.lat == null && r.lng == null, "city=sf alone should not geocode");
}

// Funcheap Redwood City listing wrongly stamped with SF centroid.
{
  const r = resolveEventCoords({
    city: "sf",
    lat: 37.7749,
    lng: -122.4194,
    venueName: "Courthouse Square",
    title: '20th Annual “Music on the Square” Free Concerts Every Friday (Redwood City)',
    address: "2200 Broadway, Redwood City, CA",
    neighborhood: "Redwood City",
  });
  assert(r.geoSource === "Redwood City", `expected Redwood City, got ${r.geoSource}`);
  assert(nearly(r.lat!, 37.4852) && nearly(r.lng!, -122.2364), "Redwood City coords");
}

// 19hz Walnut Creek venue with SF centroid.
{
  const r = resolveEventCoords({
    city: "sf",
    lat: 37.7749,
    lng: -122.4194,
    venueName: "Retro Junkie (Walnut Creek)",
    title: "Daft Punk Tribute Night w/ Glitterazzi SF + DJ Thomas Young & DJ Spades",
  });
  assert(r.geoSource === "Walnut Creek", `expected Walnut Creek, got ${r.geoSource}`);
  assert(nearly(r.lat!, 37.9101) && nearly(r.lng!, -122.0652), "Walnut Creek coords");
}

// Real upstream coords must not be overridden by locality text.
{
  const r = resolveEventCoords({
    lat: 37.7599,
    lng: -122.4148,
    city: "sf",
    address: "Mission District, San Francisco",
    neighborhood: "Mission",
  });
  assert(nearly(r.lat!, 37.7599) && nearly(r.lng!, -122.4148), "keep real coords");
  assert(r.geoSource == null, "no geoSource when trusting upstream");
}

// chicago feed slug still resolves via free text when no better place.
{
  const r = resolveEventCoords({ city: "chicago", title: "Something in Chicago" });
  assert(r.geoSource === "Chicago", `expected Chicago, got ${r.geoSource}`);
}

console.log("venueGeo.selftest: ok");
