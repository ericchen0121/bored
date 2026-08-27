#!/usr/bin/env node
/**
 * Resolve activity images via Openverse (CC-licensed) + Unsplash fallbacks.
 */

const QUERIES = {
  "sf-ggp-walk": "golden gate park san francisco",
  "sf-dolores-park": "dolores park san francisco",
  "sf-crissy-field": "crissy field golden gate bridge",
  "sf-lands-end": "lands end san francisco trail",
  "sf-ferry-embarcadero": "san francisco ferry building",
  "sf-alamo-square": "painted ladies alamo square san francisco",
  "sf-twin-peaks": "twin peaks san francisco view",
  "sf-emporium": "arcade bar pinball machines",
  "sf-detour": "retro arcade games neon",
  "sf-wasteland": "haight ashbury san francisco street",
  "sf-community-thrift": "thrift store clothing racks",
  "sf-spark-social": "food trucks outdoor patio night",
  "sf-presidio-range": "golf driving range buckets",
  "sf-bad-axe": "axe throwing target",
  "sf-clarion-alley": "clarion alley murals san francisco",
  "sf-balmy-alley": "balmy alley murals mission",
  "sf-mission-mural-route": "mission district murals san francisco",
  "sf-bernal-heights": "bernal heights park san francisco",
  "sf-mount-sutro": "mount sutro forest san francisco",
  "sf-glen-canyon": "glen canyon park san francisco",
  "sf-seward-slides": "concrete slide park kids",
  "sf-baker-beach-bluffs": "baker beach golden gate bridge",
  "sf-palace-fine-arts": "palace of fine arts san francisco",
  "sf-gg-bridge-walk": "golden gate bridge walkway",
  "sf-stow-lake": "stow lake golden gate park",
  "sf-botanical-garden": "san francisco botanical garden",
  "sf-filbert-steps": "filbert steps telegraph hill",
  "sf-ocean-beach": "ocean beach san francisco",
  "sf-lyon-steps": "lyon street steps san francisco",
  "sf-fort-point": "fort point golden gate bridge",
  "sf-japantown": "japantown peace pagoda san francisco",
  "sf-mission-bowling": "bowling alley lanes",
  "sf-movement-climbing": "indoor bouldering climbing gym",
  "sf-angel-island": "angel island san francisco bay",
  "chi-millennium-park": "cloud gate bean chicago",
  "chi-lakefront-trail": "chicago lakefront trail bike",
  "chi-lincoln-park": "lincoln park chicago",
  "chi-the-606": "606 trail chicago bloomingdale",
  "chi-riverwalk": "chicago riverwalk",
  "chi-navy-pier": "navy pier chicago",
  "chi-grant-park": "buckingham fountain chicago",
  "chi-puttery": "indoor mini golf colorful",
  "chi-emporium": "arcade bar pinball chicago",
  "chi-replay": "pinball machines bar",
  "chi-unique-thrift": "vintage thrift clothing store",
  "chi-village-discount": "thrift store aisles",
  "chi-politan-row": "food hall vendors",
  "chi-pilsen-16th-murals": "pilsen chicago murals",
  "chi-wabash-arts": "street art murals chicago",
  "chi-pilsen-18th-walk": "pilsen chicago street",
  "chi-diversey-range": "golf driving range lake",
  "chi-bad-axe": "axe throwing indoor",
  "chi-ping-tom": "ping tom park chicago chinatown",
  "chi-promontory-point": "promontory point chicago",
  "chi-garfield-conservatory": "garfield park conservatory chicago",
  "chi-oz-park": "oz park chicago wizard",
  "chi-montrose-bird-sanctuary": "montrose harbor chicago",
  "chi-maggie-daley": "maggie daley park chicago",
  "chi-cultural-center": "chicago cultural center dome",
  "chi-oak-street-beach": "oak street beach chicago",
  "chi-northerly-island": "northerly island chicago skyline",
  "chi-humboldt-lagoon": "humboldt park chicago lagoon",
  "chi-lily-pool": "alfred caldwell lily pool chicago",
  "chi-logan-arcade": "arcade games neon lights",
  "chi-whirlyball": "indoor sports arena fun",
  "chi-chinatown-square": "chinatown chicago gate",
  "chi-logan-boulevard": "logan square chicago boulevard",
  "chi-printers-row": "printers row chicago",
  "chi-north-ave-beach": "north avenue beach chicago",
};

const UNSPLASH_FALLBACK = {
  "sf-emporium": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80",
  "sf-detour": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80",
  "sf-bad-axe": "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=800&q=80",
  "sf-mission-bowling": "https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=800&q=80",
  "sf-movement-climbing": "https://images.unsplash.com/photo-1522163186149-048a82f4b0c6?w=800&q=80",
  "sf-presidio-range": "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&q=80",
  "sf-community-thrift": "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&q=80",
  "sf-spark-social": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
  "sf-seward-slides": "https://images.unsplash.com/photo-1476459391320-d45be0cd6c0b?w=800&q=80",
  "chi-puttery": "https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800&q=80",
  "chi-emporium": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80",
  "chi-replay": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80",
  "chi-unique-thrift": "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&q=80",
  "chi-village-discount": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80",
  "chi-politan-row": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
  "chi-diversey-range": "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&q=80",
  "chi-bad-axe": "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=800&q=80",
  "chi-logan-arcade": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80",
  "chi-whirlyball": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function openverse(query) {
  const params = new URLSearchParams({
    q: query,
    page_size: "5",
    mature: "false",
  });
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: {
      "User-Agent": "BoredActivityCurator/1.0 (local curation; contact: local)",
    },
  });
  if (!res.ok) {
    console.error(`openverse ${res.status} for ${query}`);
    return null;
  }
  const data = await res.json();
  const results = data?.results ?? [];
  for (const r of results) {
    const url = r.url || r.thumbnail;
    if (!url) continue;
    if (/\.(svg|pdf)$/i.test(url)) continue;
    if (/logo|icon|map|flag|svg/i.test(url)) continue;
    // Prefer larger images
    return url;
  }
  return null;
}

const out = {};
const missing = [];

for (const [id, query] of Object.entries(QUERIES)) {
  let url = await openverse(query);
  if (!url && UNSPLASH_FALLBACK[id]) url = UNSPLASH_FALLBACK[id];
  if (url) out[id] = url;
  else missing.push(id);
  await sleep(250);
}

console.log(JSON.stringify(out, null, 2));
console.error(`\nResolved ${Object.keys(out).length}/${Object.keys(QUERIES).length}`);
if (missing.length) console.error("Missing:", missing.join(", "));
