/**
 * City-local video (Instagram / YouTube) — captions often belong to a
 * travel-y influencer tagged to one metro. Shared by ingest + feed ranking.
 */

import type { FeedArea, FeedCity } from "./taxonomy";
import { metroFromArea } from "./taxonomy";

export type VideoMetro = FeedCity;

type NeighborhoodRule = { re: RegExp; name: string };

const NEIGHBORHOODS: Record<VideoMetro, NeighborhoodRule[]> = {
  sf: [
    { re: /\bmission(?:\s+district)?\b/i, name: "Mission" },
    { re: /\bsoma\b|south of market/i, name: "SoMa" },
    { re: /\bnorth beach\b/i, name: "North Beach" },
    { re: /\binner richmond\b|\bouter richmond\b|\brichmond district\b/i, name: "Richmond" },
    { re: /\binner sunset\b|\bouter sunset\b|\bsunset district\b/i, name: "Sunset" },
    { re: /\bhaight\b/i, name: "Haight" },
    { re: /\bhayes valley\b/i, name: "Hayes Valley" },
    { re: /\bmarina\b/i, name: "Marina" },
    { re: /\bembarcadero\b|ferry building/i, name: "Embarcadero" },
    { re: /\bjapantown\b/i, name: "Japantown" },
    { re: /\bdogpatch\b/i, name: "Dogpatch" },
    { re: /\bpotrero\b/i, name: "Potrero Hill" },
    { re: /\bcastro\b/i, name: "Castro" },
    { re: /\bnopa\b/i, name: "NoPa" },
    { re: /\btenderloin\b/i, name: "Tenderloin" },
    { re: /\bfidi\b|financial district\b/i, name: "Financial District" },
    { re: /\bnoe valley\b/i, name: "Noe Valley" },
    { re: /\bwest portal\b|#westportal\b/i, name: "West Portal" },
    { re: /\bbernal\b/i, name: "Bernal Heights" },
    { re: /\boakland\b/i, name: "Oakland" },
    { re: /\bberkeley\b/i, name: "Berkeley" },
    { re: /\bsan mateo\b/i, name: "San Mateo" },
    { re: /\bpalo alto\b/i, name: "Palo Alto" },
    { re: /\bdaly city\b/i, name: "Daly City" },
  ],
  chicago: [
    { re: /\bwicker park\b/i, name: "Wicker Park" },
    { re: /\blincoln park\b/i, name: "Lincoln Park" },
    { re: /\briver north\b/i, name: "River North" },
    { re: /\bwest loop\b/i, name: "West Loop" },
    { re: /\blogan square\b/i, name: "Logan Square" },
    { re: /\bpilsen\b/i, name: "Pilsen" },
    { re: /\blakeview\b/i, name: "Lakeview" },
    { re: /\bhyde park\b/i, name: "Hyde Park" },
    { re: /\bandersonville\b/i, name: "Andersonville" },
    { re: /\bfulton market\b/i, name: "Fulton Market" },
    { re: /\bwrigleyville\b/i, name: "Wrigleyville" },
    { re: /\blincoln square\b/i, name: "Lincoln Square" },
    { re: /\bbucktown\b/i, name: "Bucktown" },
  ],
  la: [
    { re: /\bhollywood\b/i, name: "Hollywood" },
    { re: /\bsilver lake\b/i, name: "Silver Lake" },
    { re: /\bvenice\b/i, name: "Venice" },
    { re: /\bdowntown la\b|\bdtla\b|\bdowntown los angeles\b/i, name: "Downtown" },
    { re: /\bkoreatown\b|\bk-town\b/i, name: "Koreatown" },
    { re: /\bwest hollywood\b|\bweho\b/i, name: "West Hollywood" },
    { re: /\bsanta monica\b/i, name: "Santa Monica" },
    { re: /\becho park\b/i, name: "Echo Park" },
    { re: /\barts district\b/i, name: "Arts District" },
    { re: /\bmelrose\b/i, name: "Melrose" },
    { re: /\bculver city\b/i, name: "Culver City" },
    { re: /\blos feliz\b/i, name: "Los Feliz" },
    { re: /\bpasadena\b/i, name: "Pasadena" },
  ],
};

/** Strong “this is in our metro” — hashtags, city names, local handles. */
const LOCAL_RE: Record<VideoMetro, RegExp> = {
  sf: /san francisco|#sf[a-z]*\b|#onlyinsf|#sanfrancisco|#bayarea[a-z]*\b|#oaklandbakery|\bsf bay\b|\bbay area\b|\boakland\b|\bberkeley\b|\bin sf\b|\bnow in sf\b|#westportal\b|\.sf\b|_sf\b/i,
  chicago:
    /\bchicago\b|#chicago[a-z]*\b|#312\b|#windycity|\bwindy city\b|_chi\b|\.chicago\b/i,
  la: /los angeles|#laeats\b|#lafood\b|#losangeles|#discoverla|#dtla\b|\bla county\b|_la\b|eater_?la\b/i,
};

/**
 * Strong “this is somewhere else” — hashtags, pin lines, “in NYC”.
 * Bare “Chicago” in a comparison sentence is intentionally *not* enough
 * (e.g. Eater SF mentioning Kasama).
 */
const FOREIGN_STRONG: Record<string, RegExp> = {
  ny: /#nyc\b|#nyceats|#nycfood|#nycfoodie|#nycrestaurants|#chinatownnyc|#newforkcity|#williamsburgbrooklyn|\bnyc\b|new york city|\bnew york\b|\bbrooklyn\b|\bmanhattan\b|\bqueens\b|\bflushing\b|\bwilliamsburg\b|\beast village\b|\bwest village\b|chelsea market|\bat jfk\b|📍[^\n]*(nyc|new york|brooklyn|manhattan)/i,
  chicago:
    /#chicago\b|#chicagoeats|#chicagofood|#312\b|\bin chicago\b|\bwhen in chicago\b|📍[^\n]*chicago|fieldmuseum/i,
  la: /#laeats|#lafood|#losangeles|#discoverla|#universalstudioshollywood|\blos angeles\b|\bin la\b|📍[^\n]*(los angeles|hollywood(?!\s+sign))|universal studios hollywood/i,
  travel:
    /\b(paris|#paris\b|london|#london\b|tokyo|#tokyo\b|lisbon|portugal|#miami\b|\bin miami\b|mexico city|#cdmx\b|seoul|#seoul\b|bangkok|#tokyo)/i,
};

const LOCAL_OUTLETS: Record<VideoMetro, readonly string[]> = {
  sf: [
    "eater_sf",
    "tablehopper",
    "sfchronicle_food",
    "onlyinsf",
    "sfstandard",
    "funcheap",
    "brokeassstuart",
    "7x7bayarea",
    "sfgate",
    "missionlocal",
    "thebolditalic",
    "taratastessf",
    "bayareabites",
    "cheycheyfromthebay",
    "sfbites",
    "eatdrinksf",
  ],
  chicago: [
    "timeoutchicago",
    "choosechicago",
    "do312",
    "chicagofoodauthority",
    "chicagofoodie",
    "chicagofoodhq",
    "blockclubchi",
    "chicagomag",
    "chicagotribune",
    "bestfoodchicago",
    "chicagofoodgirl",
    "eatlikeachi",
    "erica_eatseverything",
    "chicityeating",
    "chicityfoodie",
  ],
  la: [
    "eater_la",
    "discoverla",
    "lafoodie",
    "latimesfood",
    "lamag",
    "bestfoodla",
    "laeats",
    "hungry4munchies",
    "lisaeatsla",
    "hungryinla",
    "lafoodjunkie",
    "lafoodieguy",
    "wonhophoto",
    "tastingtable",
  ],
};

export function videoLocalityText(
  parts: Array<string | null | undefined>,
): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

export function videoNeighborhoodFromText(
  text: string,
  metro: VideoMetro,
): string | null {
  for (const { re, name } of NEIGHBORHOODS[metro]) {
    if (re.test(text)) return name;
  }
  return null;
}

export function mentionsLocalVideoMetro(
  text: string,
  metro: VideoMetro,
): boolean {
  if (!text.trim()) return false;
  if (LOCAL_RE[metro].test(text)) return true;
  return NEIGHBORHOODS[metro].some(({ re }) => re.test(text));
}

function mentionsForeignVideoMetro(
  text: string,
  metro: VideoMetro,
): boolean {
  if (FOREIGN_STRONG.ny.test(text)) return true;
  if (metro !== "chicago" && FOREIGN_STRONG.chicago.test(text)) return true;
  if (metro !== "la" && FOREIGN_STRONG.la.test(text)) return true;
  if (FOREIGN_STRONG.travel.test(text)) return true;
  return false;
}

/** Metro-branded outlet — keep posts unless they clearly take place elsewhere. */
export function isLocalVideoOutlet(
  handle: string | null | undefined,
  metro: VideoMetro,
): boolean {
  const h = (handle ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!h) return false;
  if (LOCAL_OUTLETS[metro].includes(h)) return true;
  const compact = h.replace(/[._]/g, "");
  if (metro === "sf") {
    return /(sf|sanfrancisco|bayarea|fromthebay)$/.test(compact) ||
      compact.startsWith("sf") ||
      compact.includes("sanfrancisco");
  }
  if (metro === "chicago") {
    return compact.includes("chicago") || compact.endsWith("chi");
  }
  if (metro === "la") {
    return (
      compact.includes("losangeles") ||
      (compact.endsWith("la") && compact.includes("eater"))
    );
  }
  return false;
}

/**
 * Whether a reel/short belongs on this metro’s feed.
 * Local outlets: keep unless the caption is clearly another city.
 * Everyone else: require a local city / neighborhood / hashtag signal.
 */
export function isVideoContentLocalToMetro(opts: {
  text: string;
  metro: VideoMetro;
  handle?: string | null;
  localOutlet?: boolean;
}): boolean {
  const text = opts.text ?? "";
  const localOutlet =
    opts.localOutlet ?? isLocalVideoOutlet(opts.handle, opts.metro);
  const local = mentionsLocalVideoMetro(text, opts.metro);
  const foreign = mentionsForeignVideoMetro(text, opts.metro);
  if (foreign && !local) return false;
  if (local) return true;
  if (localOutlet && !foreign) return true;
  return false;
}

export function videoMetroFromFeedArea(area: FeedArea): VideoMetro {
  return metroFromArea(area);
}
