/**
 * Curated venue / neighborhood / city → lat/lng for listings that ship
 * without coordinates (notably Funcheap). Match is case-insensitive
 * substring on venue / title / address / neighborhood / city.
 *
 * Used by API `presentEvent` (maps) and web event weather. Prefer real
 * upstream lat/lng; never invent coords when nothing local matches.
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
    label: "Abbey Tavern",
    match: ["abbey tavern", "4100 geary"],
    lat: 37.7812,
    lng: -122.4635,
  },
  {
    label: "Roxie Theater",
    match: ["roxie theater", "roxie theatre", "the roxie", "roxie"],
    lat: 37.7647,
    lng: -122.4225,
  },
  {
    label: "Mesa Maguey",
    match: ["mesa maguey", "4031 broadway"],
    lat: 37.8285,
    lng: -122.257,
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

/** Approximate SF neighborhood centers for weather / map fallbacks. */
const SF_NEIGHBORHOOD_GEO: VenueGeoEntry[] = [
  {
    label: "Richmond",
    match: ["richmond", "inner richmond", "outer richmond", "richmond district"],
    lat: 37.7799,
    lng: -122.482,
  },
  {
    label: "Sunset",
    match: ["sunset", "inner sunset", "outer sunset", "sunset district"],
    lat: 37.7599,
    lng: -122.495,
  },
  {
    label: "Mission",
    match: ["mission", "mission district", "the mission"],
    lat: 37.7599,
    lng: -122.4148,
  },
  {
    label: "Castro",
    match: ["castro"],
    lat: 37.7609,
    lng: -122.435,
  },
  {
    label: "Marina",
    match: ["marina", "marina district", "cow hollow"],
    lat: 37.8037,
    lng: -122.4368,
  },
  {
    label: "North Beach",
    match: ["north beach", "northbeach"],
    lat: 37.8001,
    lng: -122.4095,
  },
  {
    label: "SoMa",
    match: ["soma", "south of market"],
    lat: 37.7785,
    lng: -122.4056,
  },
  {
    label: "Hayes Valley",
    match: ["hayes valley"],
    lat: 37.7763,
    lng: -122.4242,
  },
  {
    label: "Haight",
    match: ["haight", "haight-ashbury", "haight ashbury", "upper haight"],
    lat: 37.7697,
    lng: -122.4477,
  },
  {
    label: "Noe Valley",
    match: ["noe valley"],
    lat: 37.7503,
    lng: -122.4337,
  },
  {
    label: "Potrero Hill",
    match: ["potrero"],
    lat: 37.7595,
    lng: -122.398,
  },
  {
    label: "Dogpatch",
    match: ["dogpatch"],
    lat: 37.7605,
    lng: -122.3889,
  },
  {
    label: "Financial District",
    match: ["financial district", "fidi", "embarcadero"],
    lat: 37.7946,
    lng: -122.3999,
  },
  {
    label: "Chinatown",
    match: ["chinatown"],
    lat: 37.7941,
    lng: -122.4078,
  },
  {
    label: "Excelsior",
    match: ["excelsior"],
    lat: 37.7244,
    lng: -122.4272,
  },
  {
    label: "Bernal Heights",
    match: ["bernal"],
    lat: 37.7412,
    lng: -122.4178,
  },
  {
    label: "Bayview",
    match: ["bayview", "hunters point"],
    lat: 37.7304,
    lng: -122.3842,
  },
  {
    label: "Western Addition",
    match: ["western addition", "fillmore"],
    lat: 37.7822,
    lng: -122.4342,
  },
  {
    label: "Tenderloin",
    match: ["tenderloin"],
    lat: 37.7847,
    lng: -122.4145,
  },
  {
    label: "Pacific Heights",
    match: ["pacific heights", "pac heights"],
    lat: 37.7925,
    lng: -122.4382,
  },
];

/**
 * City / locality centroids — Bay Area + LA + Chicago metros.
 * Matched against `city`, `neighborhood`, and address text.
 * Longer needles first where needed (e.g. "los altos" before "los").
 */
const LOCALITY_GEO: VenueGeoEntry[] = [
  // Bay — East Bay / Peninsula / South Bay
  {
    label: "Oakland",
    match: ["oakland"],
    lat: 37.8044,
    lng: -122.2712,
  },
  {
    label: "Berkeley",
    match: ["berkeley"],
    lat: 37.8715,
    lng: -122.273,
  },
  {
    label: "Alameda",
    match: ["alameda"],
    lat: 37.7652,
    lng: -122.2416,
  },
  {
    label: "Emeryville",
    match: ["emeryville"],
    lat: 37.8313,
    lng: -122.2852,
  },
  {
    label: "San Jose",
    match: ["san jose", "san_jose"],
    lat: 37.3382,
    lng: -121.8863,
  },
  {
    label: "Palo Alto",
    match: ["palo alto", "palo_alto"],
    lat: 37.4419,
    lng: -122.143,
  },
  {
    label: "Los Altos",
    match: ["los altos", "los_altos"],
    lat: 37.3688,
    lng: -122.1175,
  },
  {
    label: "Mountain View",
    match: ["mountain view", "mountain_view"],
    lat: 37.3861,
    lng: -122.0839,
  },
  {
    label: "Redwood City",
    match: ["redwood city", "redwood_city"],
    lat: 37.4852,
    lng: -122.2364,
  },
  {
    label: "Daly City",
    match: ["daly city", "daly_city"],
    lat: 37.6879,
    lng: -122.4702,
  },
  {
    label: "San Mateo",
    match: ["san mateo", "san_mateo"],
    lat: 37.5629,
    lng: -122.3255,
  },
  {
    label: "Walnut Creek",
    match: ["walnut creek", "walnut_creek"],
    lat: 37.9101,
    lng: -122.0652,
  },
  {
    label: "San Rafael",
    match: ["san rafael", "san_rafael"],
    lat: 37.9735,
    lng: -122.5311,
  },
  {
    label: "Sausalito",
    match: ["sausalito"],
    lat: 37.8591,
    lng: -122.4853,
  },
  {
    label: "Mill Valley",
    match: ["mill valley", "mill_valley"],
    lat: 37.906,
    lng: -122.545,
  },
  {
    label: "San Francisco",
    match: ["san francisco", "san_francisco", "sf"],
    lat: 37.7749,
    lng: -122.4194,
  },
  // LA metro
  {
    label: "Los Angeles",
    match: ["los angeles", "los_angeles", "la"],
    lat: 34.0522,
    lng: -118.2437,
  },
  {
    label: "Hollywood",
    match: ["hollywood"],
    lat: 34.0928,
    lng: -118.3287,
  },
  {
    label: "Santa Monica",
    match: ["santa monica", "santa_monica"],
    lat: 34.0195,
    lng: -118.4912,
  },
  {
    label: "Pasadena",
    match: ["pasadena"],
    lat: 34.1478,
    lng: -118.1445,
  },
  {
    label: "Culver City",
    match: ["culver city", "culver_city"],
    lat: 34.0211,
    lng: -118.3965,
  },
  {
    label: "Silver Lake",
    match: ["silver lake", "silverlake", "silver_lake"],
    lat: 34.0869,
    lng: -118.2702,
  },
  {
    label: "Echo Park",
    match: ["echo park", "echo_park"],
    lat: 34.0782,
    lng: -118.2606,
  },
  // Chicago metro
  {
    label: "Chicago",
    match: ["chicago"],
    lat: 41.8781,
    lng: -87.6298,
  },
  {
    label: "Wicker Park",
    match: ["wicker park", "wicker_park"],
    lat: 41.9088,
    lng: -87.6796,
  },
  {
    label: "Logan Square",
    match: ["logan square", "logan_square"],
    lat: 41.923,
    lng: -87.709,
  },
];

function haystack(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" · ")
    .toLowerCase();
}

function matchGeoEntry(
  text: string,
  entries: VenueGeoEntry[],
): VenueGeoHit | null {
  for (const entry of entries) {
    if (entry.match.some((m) => text.includes(m))) {
      return { lat: entry.lat, lng: entry.lng, label: entry.label };
    }
  }
  return null;
}

/** Match locality needles as whole tokens / city field values (avoid "la" in "plaza"). */
function matchLocality(
  cityField: string,
  text: string,
): VenueGeoHit | null {
  const cityNorm = cityField.trim().toLowerCase().replace(/_/g, " ");
  if (cityNorm) {
    for (const entry of LOCALITY_GEO) {
      if (
        entry.match.some(
          (m) => cityNorm === m || cityNorm === m.replace(/\s+/g, "_"),
        )
      ) {
        return { lat: entry.lat, lng: entry.lng, label: entry.label };
      }
    }
  }

  // Prefer longer locality names in free text (Los Altos before "la").
  const byLength = [...LOCALITY_GEO].sort(
    (a, b) =>
      Math.max(...b.match.map((m) => m.length)) -
      Math.max(...a.match.map((m) => m.length)),
  );
  for (const entry of byLength) {
    for (const m of entry.match) {
      if (m.length < 3) continue; // skip ambiguous "sf" / "la" in free text
      if (text.includes(m)) {
        return { lat: entry.lat, lng: entry.lng, label: entry.label };
      }
    }
  }
  return null;
}

/**
 * If lat/lng are missing, try curated venue → neighborhood → city/address locality.
 * Does not override existing coordinates.
 *
 * Contract: any listing with a usable address or city/neighborhood should resolve
 * to local coords for weather + maps. Add venues/localities here as gaps appear.
 */
export function resolveEventCoords(input: {
  lat?: number | string | null;
  lng?: number | string | null;
  venueName?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
}): { lat: number | null; lng: number | null; geoSource?: string } {
  const lat =
    typeof input.lat === "number"
      ? input.lat
      : input.lat != null && input.lat !== ""
        ? Number(input.lat)
        : null;
  const lng =
    typeof input.lng === "number"
      ? input.lng
      : input.lng != null && input.lng !== ""
        ? Number(input.lng)
        : null;
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }

  const venueText = haystack([
    input.venueName,
    input.title,
    input.address,
    input.neighborhood,
  ]);
  if (venueText) {
    const venue = matchGeoEntry(venueText, SF_VENUE_GEO);
    if (venue) {
      return { lat: venue.lat, lng: venue.lng, geoSource: venue.label };
    }
  }

  const hoodText = haystack([input.neighborhood, input.address, input.title]);
  if (hoodText) {
    const hood = matchGeoEntry(hoodText, SF_NEIGHBORHOOD_GEO);
    if (hood) {
      return { lat: hood.lat, lng: hood.lng, geoSource: hood.label };
    }
  }

  const localityText = haystack([
    input.city,
    input.neighborhood,
    input.address,
    input.venueName,
    input.title,
  ]);
  const locality = matchLocality(input.city ?? "", localityText);
  if (locality) {
    return { lat: locality.lat, lng: locality.lng, geoSource: locality.label };
  }

  return { lat: null, lng: null };
}
