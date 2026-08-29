/**
 * Curated venue → lat/lng for listings that ship without coordinates
 * (notably Funcheap). Match is case-insensitive substring on venue / title / address.
 */

export type VenueGeoHit = {
  lat: number;
  lng: number;
  /** Matched label for debugging */
  label: string;
};

type VenueGeoEntry = {
  /** Lowercase needles — any match wins */
  match: string[];
  lat: number;
  lng: number;
  label: string;
};

/** SF Bay venues that show up often without upstream geo. */
const SF_VENUE_GEO: VenueGeoEntry[] = [
  {
    label: "The Function",
    match: [
      "the function",
      "golden gate comedy",
      "hellasecret",
      "crazy funny asians",
      "rush hour comedy",
      "black-owned comedy",
    ],
    lat: 37.7754,
    lng: -122.4178,
  },
  {
    label: "Robin Williams Meadow",
    match: [
      "robin williams meadow",
      "sharon meadow",
      "comedy day",
      "golden gate park",
    ],
    lat: 37.7699,
    lng: -122.4572,
  },
  {
    label: "Adobe Books",
    match: ["adobe books"],
    lat: 37.7525,
    lng: -122.4147,
  },
  {
    label: "Punch Line SF",
    match: ["punch line", "punchline"],
    lat: 37.7955,
    lng: -122.4001,
  },
  {
    label: "Cobb's Comedy Club",
    match: ["cobb's", "cobbs comedy"],
    lat: 37.8029,
    lng: -122.4142,
  },
  {
    label: "Neck of the Woods",
    match: ["neck of the woods"],
    lat: 37.7832,
    lng: -122.4638,
  },
  {
    label: "The Masonic",
    match: ["the masonic", "masonic auditorium"],
    lat: 37.7914,
    lng: -122.4133,
  },
  {
    label: "Brick & Mortar Music Hall",
    match: ["brick & mortar", "brick and mortar"],
    lat: 37.7673,
    lng: -122.4201,
  },
  {
    label: "PianoFight",
    match: ["pianofight"],
    lat: 37.7816,
    lng: -122.4097,
  },
  {
    label: "Doc's Lab",
    match: ["doc's lab", "docs lab"],
    lat: 37.7982,
    lng: -122.4059,
  },
];

function haystack(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" · ")
    .toLowerCase();
}

/**
 * If lat/lng are missing, try curated venue / title / address matches.
 * Does not override existing coordinates.
 */
export function resolveEventCoords(input: {
  lat?: number | null;
  lng?: number | null;
  venueName?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
}): { lat: number | null; lng: number | null; geoSource?: string } {
  const lat = input.lat;
  const lng = input.lng;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }

  const city = (input.city ?? "").toLowerCase();
  // Curated table is SF-focused for now.
  if (city && city !== "sf" && city !== "san francisco" && city !== "san_francisco") {
    return { lat: null, lng: null };
  }

  const text = haystack([input.venueName, input.title, input.address]);
  if (!text) return { lat: null, lng: null };

  for (const entry of SF_VENUE_GEO) {
    if (entry.match.some((m) => text.includes(m))) {
      return { lat: entry.lat, lng: entry.lng, geoSource: entry.label };
    }
  }

  return { lat: null, lng: null };
}
