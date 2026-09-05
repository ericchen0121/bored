/**
 * Curated venue / neighborhood / city → lat/lng for listings that ship
 * without coordinates (notably Funcheap). Match is case-insensitive
 * substring on venue / title / address / neighborhood / city.
 *
 * Used by API `presentEvent` (maps) and web event weather. Prefer real
 * upstream lat/lng; never invent coords when nothing local matches.
 *
 * Note: `events.city` is often a feed metro slug (`sf` / `la` / `chicago`),
 * not a geographic locality — do not treat those as map pins.
 */

import {
  CHI_DEFAULT,
  FEED_CITIES,
  LA_DEFAULT,
  SF_DEFAULT,
} from "./taxonomy";

export type VenueGeoHit = {
  lat: number;
  lng: number;
  /** Matched label for debugging */
  label: string;
};

/** Metro centroids used as weak placeholders when city is only a feed slug. */
const METRO_CENTROIDS: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: SF_DEFAULT.lat, lng: SF_DEFAULT.lng },
  { lat: CHI_DEFAULT.lat, lng: CHI_DEFAULT.lng },
  { lat: LA_DEFAULT.lat, lng: LA_DEFAULT.lng },
];

function isMetroCentroid(lat: number, lng: number): boolean {
  return METRO_CENTROIDS.some(
    (c) => Math.abs(c.lat - lat) < 1e-4 && Math.abs(c.lng - lng) < 1e-4,
  );
}

const FEED_CITY_SLUGS = new Set<string>(FEED_CITIES);

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
    match: ["doc's lab", "docs lab", "tabernacle comedy"],
    lat: 37.7982,
    lng: -122.4059,
  },
  {
    label: "Mabuhay Gardens",
    match: ["mabuhay gardens", "the mab", "themab"],
    lat: 37.7979,
    lng: -122.4055,
  },
  {
    label: "Throckmorton Theatre",
    match: ["throckmorton", "142 throckmorton"],
    lat: 37.906,
    lng: -122.545,
  },
  {
    label: "Stork Club Oakland",
    match: ["stork club", "storking comedy"],
    lat: 37.8136,
    lng: -122.2682,
  },
  {
    label: "The BreakRoom",
    match: ["breakroom", "break room berkeley"],
    lat: 37.8715,
    lng: -122.2687,
  },
  {
    label: "Stay Gold Deli",
    match: ["stay gold"],
    lat: 37.8189,
    lng: -122.2728,
  },
  {
    label: "Fireside Lounge Alameda",
    match: ["fireside lounge", "alameda comedy", "alameda theatre"],
    lat: 37.7725,
    lng: -122.2765,
  },
  {
    label: "Orpheum Theatre SF",
    match: ["orpheum theatre", "orpheum theater", "broadwaysf"],
    lat: 37.7793,
    lng: -122.4145,
  },
  {
    label: "Golden Gate Theatre",
    match: ["golden gate theatre", "golden gate theater"],
    lat: 37.7822,
    lng: -122.4108,
  },
  {
    label: "Curran Theatre",
    match: ["curran theatre", "curran theater"],
    lat: 37.7869,
    lng: -122.4101,
  },
  {
    label: "ACT Geary Theater",
    match: ["act geary", "geary theater", "american conservatory theater"],
    lat: 37.787,
    lng: -122.4107,
  },
  {
    label: "SF Playhouse",
    match: ["sf playhouse"],
    lat: 37.7886,
    lng: -122.4094,
  },
  {
    label: "Berkeley Rep",
    match: ["berkeley rep", "berkeley repertory"],
    lat: 37.8716,
    lng: -122.2697,
  },
  {
    label: "Mr. Tipple's Jazz Club",
    match: ["mr. tipple", "mr tipple", "mrtipples"],
    lat: 37.7762,
    lng: -122.4185,
  },
  {
    label: "Black Cat",
    match: ["black cat sf", "black cat supper", "blackcatsf"],
    lat: 37.7852,
    lng: -122.4145,
  },
  {
    label: "Sheba Piano Lounge",
    match: ["sheba piano", "sheba lounge"],
    lat: 37.7827,
    lng: -122.4327,
  },
  {
    label: "The Dawn Club",
    match: ["dawn club"],
    lat: 37.7884,
    lng: -122.4017,
  },
  {
    label: "Keys Jazz Bistro",
    match: ["keys jazz", "keys bistro"],
    lat: 37.798,
    lng: -122.4053,
  },
  {
    label: "Bird & Beckett",
    match: ["bird & beckett", "bird and beckett"],
    lat: 37.7342,
    lng: -122.4342,
  },
  {
    label: "Royal Cuckoo Organ Lounge",
    match: ["royal cuckoo"],
    lat: 37.7525,
    lng: -122.4186,
  },
  {
    label: "Harris' Restaurant",
    match: ["harris' restaurant", "harris restaurant", "pacific bar"],
    lat: 37.7878,
    lng: -122.4219,
  },
  {
    label: "Kilowatt",
    match: ["kilowatt", "kilowatt bar"],
    lat: 37.7651,
    lng: -122.4233,
  },
  {
    label: "The Knockout",
    match: ["the knockout", "knockout sf"],
    lat: 37.7458,
    lng: -122.4195,
  },
  {
    label: "Bottom of the Hill",
    match: ["bottom of the hill"],
    lat: 37.7651,
    lng: -122.3972,
  },
  {
    label: "The Independent",
    match: ["the independent", "independentsf"],
    lat: 37.7756,
    lng: -122.4376,
  },
  {
    label: "Bill Graham Civic Auditorium",
    match: ["bill graham", "civic auditorium"],
    lat: 37.7785,
    lng: -122.4174,
  },
  {
    label: "The Fillmore",
    match: ["the fillmore", "fillmore auditorium"],
    lat: 37.7841,
    lng: -122.4331,
  },
  {
    label: "The Warfield",
    match: ["the warfield", "warfield theatre", "warfield theater"],
    lat: 37.7826,
    lng: -122.4125,
  },
  {
    label: "Great American Music Hall",
    match: ["great american music hall", "gamh"],
    lat: 37.785,
    lng: -122.4189,
  },
  {
    label: "The Chapel",
    match: ["the chapel sf", "the chapel san francisco"],
    lat: 37.7605,
    lng: -122.4213,
  },
  {
    label: "Cafe du Nord",
    match: ["cafe du nord", "café du nord"],
    lat: 37.7599,
    lng: -122.4346,
  },
  {
    label: "Bimbo's 365 Club",
    match: ["bimbo's", "bimbos 365"],
    lat: 37.8037,
    lng: -122.4158,
  },
  {
    label: "August Hall",
    match: ["august hall"],
    lat: 37.7716,
    lng: -122.4135,
  },
  {
    label: "Boom Boom Room",
    match: ["boom boom room", "boom boom sf"],
    lat: 37.7842,
    lng: -122.4333,
  },
  {
    label: "Rickshaw Stop",
    match: ["rickshaw stop"],
    lat: 37.7761,
    lng: -122.4205,
  },
  // Chicago
  {
    label: "Green Mill",
    match: ["green mill"],
    lat: 41.9692,
    lng: -87.6598,
  },
  {
    label: "Jazz Showcase",
    match: ["jazz showcase"],
    lat: 41.8715,
    lng: -87.628,
  },
  {
    label: "Andy's Jazz Club",
    match: ["andy's jazz", "andys jazz"],
    lat: 41.8899,
    lng: -87.6276,
  },
  {
    label: "Empty Bottle",
    match: ["empty bottle"],
    lat: 41.9005,
    lng: -87.6865,
  },
  {
    label: "Metro Chicago",
    match: ["metro chicago", "metro & smartbar"],
    lat: 41.9499,
    lng: -87.6589,
  },
  {
    label: "Thalia Hall",
    match: ["thalia hall"],
    lat: 41.8578,
    lng: -87.6575,
  },
  {
    label: "Kingston Mines",
    match: ["kingston mines"],
    lat: 41.9295,
    lng: -87.649,
  },
  {
    label: "Buddy Guy's Legends",
    match: ["buddy guy", "buddy guys"],
    lat: 41.8732,
    lng: -87.6259,
  },
  {
    label: "Beat Kitchen",
    match: ["beat kitchen"],
    lat: 41.9397,
    lng: -87.6805,
  },
  {
    label: "Salt Shed",
    match: ["salt shed"],
    lat: 41.9125,
    lng: -87.6565,
  },
  // Los Angeles
  {
    label: "Catalina Jazz Club",
    match: ["catalina jazz"],
    lat: 34.0978,
    lng: -118.3372,
  },
  {
    label: "The Baked Potato",
    match: ["baked potato"],
    lat: 34.1365,
    lng: -118.3618,
  },
  {
    label: "Zebulon",
    match: ["zebulon"],
    lat: 34.1065,
    lng: -118.2445,
  },
  {
    label: "Lodge Room",
    match: ["lodge room"],
    lat: 34.1115,
    lng: -118.1935,
  },
  {
    label: "Troubadour",
    match: ["troubadour"],
    lat: 34.0814,
    lng: -118.3894,
  },
  {
    label: "Whisky a Go Go",
    match: ["whisky a go go", "whiskey a go go"],
    lat: 34.0908,
    lng: -118.3856,
  },
  {
    label: "The Smell",
    match: ["the smell"],
    lat: 34.0505,
    lng: -118.2465,
  },
  {
    label: "Fonda Theatre",
    match: ["fonda theatre", "fonda theater"],
    lat: 34.1014,
    lng: -118.3234,
  },
  {
    label: "The Wiltern",
    match: ["the wiltern", "wiltern theatre"],
    lat: 34.062,
    lng: -118.309,
  },
];

/** LA clubs that show up on Eventbrite / DoLA without coordinates. */
const LA_VENUE_GEO: VenueGeoEntry[] = [
  {
    label: "The Comedy Store",
    match: [
      "comedy store",
      "comedystore",
      "belly room",
      "original room",
      "potluck",
      "set of the night",
    ],
    lat: 34.0952,
    lng: -118.3739,
  },
  {
    label: "Laugh Factory Hollywood",
    match: ["laugh factory"],
    lat: 34.0983,
    lng: -118.3647,
  },
  {
    label: "Hollywood Improv",
    match: ["hollywood improv", "the improv hollywood"],
    lat: 34.0835,
    lng: -118.3735,
  },
  {
    label: "Dynasty Typewriter",
    match: ["dynasty typewriter"],
    lat: 34.0578,
    lng: -118.2765,
  },
  {
    label: "Largo",
    match: ["largo at the coronet", "largo-la"],
    lat: 34.0778,
    lng: -118.3765,
  },
  {
    label: "Flappers Comedy Club",
    match: ["flappers comedy"],
    lat: 34.1802,
    lng: -118.3117,
  },
  {
    label: "UCB Sunset",
    match: ["upright citizens brigade", "ucb sunset"],
    lat: 34.1054,
    lng: -118.3162,
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
  // Feed metro slugs (`sf`/`la`/`chicago`) are not geographic localities.
  // Prefer address / venue / neighborhood free text; chicago still matches via text.
  if (cityNorm && !FEED_CITY_SLUGS.has(cityNorm)) {
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

function inferCoordsFromPlaceText(input: {
  venueName?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
}): VenueGeoHit | null {
  const venueText = haystack([
    input.venueName,
    input.title,
    input.address,
    input.neighborhood,
  ]);
  if (venueText) {
    const venue =
      matchGeoEntry(venueText, SF_VENUE_GEO) ??
      matchGeoEntry(venueText, LA_VENUE_GEO);
    if (venue) return venue;
  }

  const hoodText = haystack([input.neighborhood, input.address, input.title]);
  if (hoodText) {
    const hood = matchGeoEntry(hoodText, SF_NEIGHBORHOOD_GEO);
    if (hood) return hood;
  }

  const localityText = haystack([
    input.city,
    input.neighborhood,
    input.address,
    input.venueName,
    input.title,
  ]);
  return matchLocality(input.city ?? "", localityText);
}

/**
 * If lat/lng are missing (or only a metro feed-slug centroid), try curated
 * venue → neighborhood → city/address locality.
 * Does not override real upstream coordinates.
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
  const hasFinite =
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  // SF/LA/CHI downtown centroids are often stamped from feed city=`sf` etc.
  // Treat those as weak so Redwood City / Walnut Creek text can win.
  const weakCentroid = hasFinite && isMetroCentroid(lat, lng);
  if (hasFinite && !weakCentroid) {
    return { lat, lng };
  }

  const inferred = inferCoordsFromPlaceText(input);
  if (inferred) {
    return { lat: inferred.lat, lng: inferred.lng, geoSource: inferred.label };
  }

  if (hasFinite) {
    return { lat, lng };
  }

  return { lat: null, lng: null };
}
