export const INTEREST_CATEGORIES = [
  "music.electronic",
  "music.live",
  "music.jazz",
  "music.rock",
  "music.indie",
  "music.punk",
  "music.metal",
  "music.blues",
  "music.folk",
  "music.country",
  "music.pop",
  "music.rnb",
  "music.house",
  "music.tech_house",
  "music.techno",
  "music.drum_and_bass",
  "music.bass",
  "music.trance",
  "music.hip_hop",
  "music.latin",
  "comedy.club",
  "comedy.showcase",
  "comedy.open_mic",
  "comedy.underground",
  "tech",
  "food",
  "arts",
  "outdoors",
  "nightlife",
  "family",
  "movies",
  "movies.arthouse",
  "movies.blockbuster",
  "free",
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];

/** Fine-grained electronic / dance genres (19hz / RA tags → tastes) */
export const MUSIC_DANCE_GENRE_CATEGORIES = [
  "music.house",
  "music.tech_house",
  "music.techno",
  "music.drum_and_bass",
  "music.bass",
  "music.trance",
] as const satisfies readonly InterestCategory[];

/**
 * Live / ticketed genres (Ticketmaster, Eventbrite, etc.).
 * Selecting these boosts non-EDM concerts beyond coarse “Live music”.
 */
export const MUSIC_LIVE_GENRE_CATEGORIES = [
  "music.rock",
  "music.indie",
  "music.punk",
  "music.metal",
  "music.blues",
  "music.jazz",
  "music.hip_hop",
  "music.rnb",
  "music.folk",
  "music.country",
  "music.pop",
  "music.latin",
] as const satisfies readonly InterestCategory[];

/** All fine-grained music genres (dance + live). Prefer the split lists in UI. */
export const MUSIC_GENRE_CATEGORIES = [
  ...MUSIC_DANCE_GENRE_CATEGORIES,
  ...MUSIC_LIVE_GENRE_CATEGORIES,
] as const satisfies readonly InterestCategory[];

export type MusicGenreCategory = (typeof MUSIC_GENRE_CATEGORIES)[number];
export type MusicDanceGenreCategory = (typeof MUSIC_DANCE_GENRE_CATEGORIES)[number];
export type MusicLiveGenreCategory = (typeof MUSIC_LIVE_GENRE_CATEGORIES)[number];

/** Short labels for feed chips, onboarding, and event tags */
export const INTEREST_LABELS: Record<InterestCategory, string> = {
  "music.electronic": "Electronic",
  "music.live": "Live music",
  "music.jazz": "Jazz",
  "music.rock": "Rock",
  "music.indie": "Indie / alt",
  "music.punk": "Punk",
  "music.metal": "Metal",
  "music.blues": "Blues",
  "music.folk": "Folk",
  "music.country": "Country",
  "music.pop": "Pop",
  "music.rnb": "R&B / soul",
  "music.house": "House",
  "music.tech_house": "Tech house",
  "music.techno": "Techno",
  "music.drum_and_bass": "Drum & bass",
  "music.bass": "Bass / dubstep",
  "music.trance": "Trance",
  "music.hip_hop": "Hip-hop",
  "music.latin": "Latin",
  "comedy.club": "Comedy clubs",
  "comedy.showcase": "Showcases",
  "comedy.open_mic": "Open mics",
  "comedy.underground": "Underground comedy",
  tech: "Tech",
  food: "Food",
  arts: "Arts",
  outdoors: "Outdoors",
  nightlife: "Nightlife",
  family: "Family",
  movies: "Movies",
  "movies.arthouse": "Arthouse",
  "movies.blockbuster": "Blockbusters",
  free: "Free",
};

/** Compact labels for scanning event cards */
export const CATEGORY_TAG_LABELS: Record<string, string> = {
  "music.electronic": "Electronic",
  "music.live": "Live music",
  "music.jazz": "Jazz",
  "music.rock": "Rock",
  "music.indie": "Indie",
  "music.punk": "Punk",
  "music.metal": "Metal",
  "music.blues": "Blues",
  "music.folk": "Folk",
  "music.country": "Country",
  "music.pop": "Pop",
  "music.rnb": "R&B",
  "music.house": "House",
  "music.tech_house": "Tech house",
  "music.techno": "Techno",
  "music.drum_and_bass": "DnB",
  "music.bass": "Bass",
  "music.trance": "Trance",
  "music.hip_hop": "Hip-hop",
  "music.latin": "Latin",
  "comedy.club": "Comedy",
  "comedy.showcase": "Comedy",
  "comedy.open_mic": "Open mic",
  "comedy.underground": "Comedy",
  tech: "Tech",
  food: "Food",
  arts: "Arts",
  outdoors: "Outdoors",
  nightlife: "Nightlife",
  family: "Family",
  movies: "Movies",
  "movies.arthouse": "Arthouse",
  "movies.blockbuster": "Blockbuster",
  free: "Free",
};

/** Provenance / adapter noise — not music genres */
const TAG_DISPLAY_NOISE = new Set([
  "19hz",
  "funcheap",
  "luma",
  "ticketmaster",
  "comedy_venue",
  "recurring",
  "partiful",
  "trending",
  "newsletter",
  "eddieslist",
  "brokeassstuart",
  "instagram",
  "openmic_agg",
  "indie_theater",
  "food",
  "do312",
  "dola",
  "chicago_cheap",
  "ra",
  "manual",
  "standup",
  "comedy",
  "party",
  "music",
  "event",
  "events",
  "eater_sf",
  "eater_chi",
  "found_sf",
  "infatuation",
  "activity",
  "iconic",
  "local_gem",
  "hike",
  "park",
  "walk",
  "play",
  "shop",
  "food_yard",
  "murals",
  "viewpoint",
  "place",
  "profile",
  "nines",
  "prose",
  "bars",
  "eventbrite",
  "rss",
  // Ticketmaster Discovery segments — coarse; we already map to categories
  "arts & theatre",
  "arts & theater",
  "miscellaneous",
  "undefined",
  // Internal: day known, wall-clock TBA (normalizeTagToken → spaces)
  "time tba",
]);

// Also hide price_$ / price_$$ tags from genre chips
function isTagDisplayNoise(key: string): boolean {
  return (
    TAG_DISPLAY_NOISE.has(key) ||
    /^price_\$+$/.test(key) ||
    key.startsWith("play_kind:")
  );
}

function normalizeTagToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Map a free-form genre label (Ticketmaster classification, 19hz tag, etc.)
 * onto interest categories. Empty when unrecognized.
 */
export function categoriesFromMusicGenreLabel(
  raw: string | null | undefined,
): InterestCategory[] {
  if (!raw?.trim()) return [];
  const t = normalizeTagToken(raw);
  if (!t || isTagDisplayNoise(t)) return [];

  const out = new Set<InterestCategory>();

  if (/\btech\s*house\b/.test(t) || t === "tech house") {
    out.add("music.tech_house");
  } else if (
    /\b(drum\s*and\s*bass|drum\s*&\s*bass|dnb|d&b|jungle)\b/.test(t) ||
    t === "drum and bass"
  ) {
    out.add("music.drum_and_bass");
  } else if (
    /\b(dubstep|riddim|bass music|bassmusic|brostep|future bass)\b/.test(t) ||
    t === "bass"
  ) {
    out.add("music.bass");
  } else if (/\b(psytrance|trance|psytech|psydub)\b/.test(t)) {
    out.add("music.trance");
  } else if (/\btechno\b/.test(t) || t === "minimal") {
    out.add("music.techno");
  } else if (/\bhouse\b/.test(t)) {
    out.add("music.house");
  } else if (
    /\b(electronic|edm|dance music|e\.?d\.?m)\b/.test(t) ||
    t === "dance"
  ) {
    out.add("music.electronic");
  }

  if (/\b(hip\s*hop|hiphop|rap|trap)\b/.test(t)) out.add("music.hip_hop");
  if (
    /\b(latin|cumbia|baile funk|perreo|banda|reggaeton|salsa|afrobeat|world)\b/.test(
      t,
    )
  ) {
    out.add("music.latin");
  }
  if (/\bjazz\b/.test(t)) out.add("music.jazz");
  if (/\bblues\b/.test(t)) out.add("music.blues");
  if (/\bpunk\b/.test(t)) out.add("music.punk");
  if (/\b(metal|hard rock)\b/.test(t)) out.add("music.metal");
  if (/\b(indie|alternative|alt\s*rock)\b/.test(t)) out.add("music.indie");
  if (/\b(folk|americana|bluegrass)\b/.test(t)) out.add("music.folk");
  if (/\bcountry\b/.test(t)) out.add("music.country");
  if (/\b(r&b|r and b|rnb|soul|funk)\b/.test(t)) out.add("music.rnb");
  if (/\bpop\b/.test(t)) out.add("music.pop");
  // Rock after more specific rock subtypes so metal/punk/indie win their chips too.
  if (/\brock\b/.test(t) && !out.has("music.metal") && !out.has("music.punk")) {
    out.add("music.rock");
  }

  // Ticketed / live genres also carry coarse Live music for “Live music” taste.
  const liveish = MUSIC_LIVE_GENRE_CATEGORIES.some((c) => out.has(c));
  if (liveish) out.add("music.live");
  if (
    out.has("music.house") ||
    out.has("music.techno") ||
    out.has("music.tech_house") ||
    out.has("music.drum_and_bass") ||
    out.has("music.bass") ||
    out.has("music.trance")
  ) {
    out.add("music.electronic");
  }

  return INTEREST_CATEGORIES.filter((c) => out.has(c));
}

/**
 * Map free-form source tags (esp. 19hz / Ticketmaster genre) onto interest categories.
 * Safe to call at ingest and again at feed-read for older rows.
 */
export function musicCategoriesFromTags(
  tags: string[] | null | undefined,
): MusicGenreCategory[] {
  if (!tags?.length) return [];
  const found = new Set<MusicGenreCategory>();
  for (const raw of tags) {
    for (const cat of categoriesFromMusicGenreLabel(raw)) {
      if ((MUSIC_GENRE_CATEGORIES as readonly string[]).includes(cat)) {
        found.add(cat as MusicGenreCategory);
      }
    }
  }
  return MUSIC_GENRE_CATEGORIES.filter((c) => found.has(c));
}

/** Merge music genres inferred from tags into event categories (deduped). */
export function enrichCategoriesWithTags(
  categories: string[],
  tags: string[] | null | undefined,
): string[] {
  if (!tags?.length) return categories;
  const fromTags = new Set<string>();
  for (const raw of tags) {
    for (const cat of categoriesFromMusicGenreLabel(raw)) {
      fromTags.add(cat);
    }
  }
  if (!fromTags.size) return categories;
  return [...new Set([...categories, ...fromTags])];
}

/** Title-case a free-form tag for chips */
export function formatTagLabel(tag: string): string {
  const t = normalizeTagToken(tag);
  if (!t) return tag;
  if (t === "r&b" || t === "r and b") return "R&B";
  if (t === "dnb" || t === "d&b") return "DnB";
  if (t === "edm") return "EDM";
  if (t === "kpop" || t === "k pop") return "K-pop";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Scannable genre chips from event.tags (skips adapter noise).
 * Prefer these over coarse "Electronic" / "Nightlife" on music cards.
 */
export function genreTagsForDisplay(
  tags: string[] | null | undefined,
  limit = 3,
): { id: string; label: string }[] {
  if (!tags?.length) return [];
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const key = normalizeTagToken(raw);
    if (!key || isTagDisplayNoise(key) || key.length < 2) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: key, label: formatTagLabel(raw) });
    if (out.length >= limit) break;
  }
  return out;
}

export type EventTypeKind =
  | "music"
  | "comedy"
  | "tech"
  | "food"
  | "arts"
  | "outdoors"
  | "nightlife"
  | "family"
  | "movies"
  | "free"
  | "event";

export type EventTypeMeta = {
  kind: EventTypeKind;
  label: string;
  /** CSS modifier: type-music, type-comedy, … */
  className: string;
};

const TYPE_META: Record<EventTypeKind, EventTypeMeta> = {
  music: { kind: "music", label: "Music", className: "type-music" },
  comedy: { kind: "comedy", label: "Comedy", className: "type-comedy" },
  tech: { kind: "tech", label: "Tech", className: "type-tech" },
  food: { kind: "food", label: "Food", className: "type-food" },
  arts: { kind: "arts", label: "Arts", className: "type-arts" },
  outdoors: { kind: "outdoors", label: "Outdoors", className: "type-outdoors" },
  nightlife: { kind: "nightlife", label: "Nightlife", className: "type-nightlife" },
  family: { kind: "family", label: "Family", className: "type-family" },
  movies: { kind: "movies", label: "Film", className: "type-movies" },
  free: { kind: "free", label: "Free", className: "type-free" },
  event: { kind: "event", label: "Event", className: "type-event" },
};

/** Priority when picking a primary scan type from categories */
const TYPE_PRIORITY: EventTypeKind[] = [
  "music",
  "comedy",
  "movies",
  "tech",
  "food",
  "arts",
  "outdoors",
  "nightlife",
  "family",
  "free",
];

function categoryToKind(cat: string): EventTypeKind | null {
  if (cat.startsWith("music.")) return "music";
  if (cat.startsWith("comedy.")) return "comedy";
  if (cat.startsWith("movies")) return "movies";
  if (cat === "tech") return "tech";
  if (cat === "food") return "food";
  if (cat === "arts") return "arts";
  if (cat === "outdoors") return "outdoors";
  if (cat === "nightlife") return "nightlife";
  if (cat === "family") return "family";
  if (cat === "free") return "free";
  return null;
}

const VENUE_TYPE_HINTS: { re: RegExp; kind: EventTypeKind }[] = [
  { re: /cobb|punch\s*line|punchline|coit\s*comedy|neck of the woods|open\s*mic|zanies|laugh factory|comedy bar|second city|lincoln lodge|annoyance|io theater|io improv/i, kind: "comedy" },
  { re: /audio|the mid|public works|temple|dna lounge|1015|bill graham|fillmore|warfield|fox theater|greek theatre|independent|slim'?s|great american/i, kind: "music" },
  { re: /alamo|roxie|castro theatre|opera plaza|landmark|sffilm|balboa/i, kind: "movies" },
];

export const COMEDY_SUBTYPES = [
  "comedy.club",
  "comedy.showcase",
  "comedy.open_mic",
  "comedy.underground",
] as const;

export const EVENT_SOURCES = [
  "19hz",
  "funcheap",
  "luma",
  "ticketmaster",
  "comedy_venue",
  "recurring",
  "partiful",
  "newsletter",
  "instagram",
  "openmic_agg",
  "indie_theater",
  "food",
  "food_deals",
  "activities",
  "new_restaurants",
  "do312",
  "dola",
  "chicago_cheap",
  "ra",
  "eventbrite",
  "manual",
] as const;

export type EventSource = (typeof EVENT_SOURCES)[number];

/** Friendly provenance labels for feed / detail */
export const EVENT_SOURCE_LABELS: Record<EventSource, string> = {
  "19hz": "19hz",
  funcheap: "Funcheap",
  luma: "Luma",
  ticketmaster: "Ticketmaster",
  comedy_venue: "Comedy venue",
  recurring: "Recurring",
  partiful: "Partiful",
  newsletter: "Newsletter",
  instagram: "Instagram",
  openmic_agg: "Open mic",
  indie_theater: "Indie theater",
  food: "Food",
  food_deals: "Food deals",
  activities: "Activities",
  new_restaurants: "New restaurants",
  do312: "Do312",
  dola: "DoLA",
  chicago_cheap: "Chicago on the Cheap",
  ra: "Resident Advisor",
  eventbrite: "Eventbrite",
  manual: "Manual",
};

/** Tag → primary type when categories are sparse (Funcheap editorial tags) */
const TAG_TYPE_HINTS: { re: RegExp; kind: EventTypeKind }[] = [
  { re: /^comedy$/i, kind: "comedy" },
  { re: /^(games|tournament)$/i, kind: "tech" },
  { re: /^(talk|politics|history|literature)$/i, kind: "tech" },
  { re: /^night market$/i, kind: "food" },
  { re: /^(festival|shopping|sports)$/i, kind: "arts" },
];

/** Source → default type when categories are sparse */
const SOURCE_TYPE_HINT: Partial<Record<EventSource, EventTypeKind>> = {
  "19hz": "music",
  comedy_venue: "comedy",
  recurring: "comedy",
  luma: "tech",
  partiful: "outdoors",
  indie_theater: "movies",
  food: "food",
  new_restaurants: "food",
  activities: "outdoors",
  do312: "nightlife",
  dola: "nightlife",
  chicago_cheap: "free",
  ra: "music",
};

/**
 * Primary event type for icons / placeholder tint.
 * Prefers categories, then venue name heuristics, then source.
 */
export function primaryEventType(opts: {
  categories?: string[] | null;
  tags?: string[] | null;
  venueName?: string | null;
  source?: string | null;
  kind?: "event" | "movie_showtime" | "recommendation";
}): EventTypeMeta {
  if (opts.kind === "movie_showtime") return TYPE_META.movies;

  const tags = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));
  // FOUND “BARS • …” tips are nightlife first, even when also tagged food.
  if (tags.has("bars")) return TYPE_META.nightlife;

  const found = new Set<EventTypeKind>();
  for (const cat of opts.categories ?? []) {
    const k = categoryToKind(cat);
    if (k) found.add(k);
  }
  for (const k of TYPE_PRIORITY) {
    if (found.has(k)) return TYPE_META[k];
  }

  const venue = opts.venueName ?? "";
  for (const hint of VENUE_TYPE_HINTS) {
    if (hint.re.test(venue)) return TYPE_META[hint.kind];
  }

  for (const raw of opts.tags ?? []) {
    const tag = normalizeTagToken(raw);
    for (const hint of TAG_TYPE_HINTS) {
      if (hint.re.test(tag)) return TYPE_META[hint.kind];
    }
  }

  const sourceHint = opts.source
    ? SOURCE_TYPE_HINT[opts.source as EventSource]
    : undefined;
  if (sourceHint) return TYPE_META[sourceHint];

  return TYPE_META.event;
}

/** Up to `limit` category tags for the card, de-duped by display label */
export function categoryTagsForDisplay(
  categories: string[],
  limit = 2,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const cat of categories) {
    if (cat === "free") continue; // shown via isFree meta
    const label = CATEGORY_TAG_LABELS[cat] ?? cat.replace(/\./g, " ");
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: cat, label });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Feed-card chips: genre tags first, then interest categories.
 * When genres exist, hide coarse music/nightlife categories (genres win)
 * but keep comedy / arts / etc. so Punch Line never reads as only "Arts & Theatre".
 */
export function eventScanTagsForDisplay(
  categories: string[],
  tags: string[] | null | undefined,
  limit = 3,
): { id: string; label: string }[] {
  const genreTags = genreTagsForDisplay(tags, limit);
  const cats = categories.filter((c) => {
    if (c === "free") return false;
    if (
      genreTags.length > 0 &&
      (c.startsWith("music.") || c === "nightlife")
    ) {
      return false;
    }
    return true;
  });
  const categoryTags = categoryTagsForDisplay(cats, limit);
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const t of [...genreTags, ...categoryTags]) {
    const key = t.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Genre chips for movie feed cards (TMS / RT / Letterboxd enrichment). */
export function movieGenresForDisplay(
  tags: string[] | null | undefined,
  categories: string[],
  limit = 3,
): { id: string; label: string }[] {
  const raw =
    tags?.length ?
      tags
    : categories.filter((c) => c !== "movies" && !c.startsWith("movies."));
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const g of raw) {
    const label = g.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: label, label });
    if (out.length >= limit) break;
  }
  return out;
}

export function categoryLabel(cat: string): string {
  return (
    INTEREST_LABELS[cat as InterestCategory] ??
    CATEGORY_TAG_LABELS[cat] ??
    cat.replace(/\./g, " ")
  );
}

export function sourceLabel(source: string): string {
  return EVENT_SOURCE_LABELS[source as EventSource] ?? source;
}

/**
 * High-signal sources offered as feed filter chips.
 * Ticketmaster chip also matches comedy_venue (TM comedy keywords).
 */
export const FEED_FILTER_SOURCES = [
  "19hz",
  "funcheap",
  "luma",
  "ticketmaster",
  "partiful",
  "indie_theater",
  "food",
  "instagram",
  "recurring",
  "do312",
  "dola",
  "chicago_cheap",
  "ra",
  "eventbrite",
] as const;

export type FeedFilterSource = (typeof FEED_FILTER_SOURCES)[number];

/** SF Bay Area feed chips */
export const SF_FEED_FILTER_SOURCES = [
  "19hz",
  "ra",
  "funcheap",
  "luma",
  "ticketmaster",
  "partiful",
  "indie_theater",
  "food",
  "instagram",
  "recurring",
  "eventbrite",
] as const satisfies readonly FeedFilterSource[];

/** Chicago feed chips */
export const CHI_FEED_FILTER_SOURCES = [
  "19hz",
  "ra",
  "do312",
  "dola",
  "chicago_cheap",
  "luma",
  "ticketmaster",
  "eventbrite",
  "food",
  "recurring",
] as const satisfies readonly FeedFilterSource[];

/** Los Angeles feed chips */
export const LA_FEED_FILTER_SOURCES = [
  "19hz",
  "ra",
  "dola",
  "luma",
  "ticketmaster",
  "eventbrite",
  "food",
  "recurring",
] as const satisfies readonly FeedFilterSource[];

/** Expand a filter chip id into concrete event.source values */
export function expandSourceFilter(sources: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of sources) {
    out.add(s);
    if (s === "ticketmaster") out.add("comedy_venue");
    if (s === "food") out.add("food_deals");
    if (s === "food") out.add("new_restaurants");
  }
  return out;
}

/** Parse comma-separated sources against the full EVENT_SOURCES enum */
export function parseEventSources(
  value: string | null | undefined,
): EventSource[] {
  if (!value?.trim()) return [];
  const allowed = new Set<string>(EVENT_SOURCES);
  const seen = new Set<EventSource>();
  const out: EventSource[] = [];
  for (const part of value.split(",")) {
    const id = part.trim() as EventSource;
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Parse sources for home feed chips (subset of EVENT_SOURCES) */
export function parseFeedSources(
  value: string | null | undefined,
): FeedFilterSource[] {
  const allowed = new Set<string>(FEED_FILTER_SOURCES);
  return parseEventSources(value).filter((s): s is FeedFilterSource =>
    allowed.has(s),
  );
}

/** User-facing activity filters — not tied to ingest source */
export const FEED_TOPICS = [
  "concerts",
  "comedy",
  "movies",
  "sports",
  "festivals",
  "free",
  "happy_hours",
  "food",
  "nightlife",
  "arts",
  "activities",
] as const;

export type FeedTopic = (typeof FEED_TOPICS)[number];

/** True when `value` is a known feed topic slug (for SEO hub routes). */
export function isFeedTopic(value: string): value is FeedTopic {
  return (FEED_TOPICS as readonly string[]).includes(value);
}

export const FEED_TOPIC_LABELS: Record<FeedTopic, string> = {
  concerts: "Concerts",
  comedy: "Comedy",
  movies: "Movies",
  sports: "Sports",
  festivals: "Street festivals",
  free: "Free",
  happy_hours: "Happy hours",
  food: "Food & drink",
  nightlife: "Nightlife",
  arts: "Arts & culture",
  activities: "Things to do",
};

/** Compact emoji prefix for topic chips / carousels */
export const FEED_TOPIC_EMOJI: Record<FeedTopic, string> = {
  concerts: "🎵",
  comedy: "🎙️",
  movies: "🎬",
  sports: "🏟️",
  festivals: "🎉",
  free: "✨",
  happy_hours: "🍻",
  food: "🍽️",
  nightlife: "🌙",
  arts: "🎨",
  activities: "🚶",
};

export function parseFeedTopics(
  value: string | null | undefined,
): FeedTopic[] {
  if (!value?.trim()) return [];
  const allowed = new Set<string>(FEED_TOPICS);
  const seen = new Set<FeedTopic>();
  const out: FeedTopic[] = [];
  for (const part of value.split(",")) {
    const id = part.trim() as FeedTopic;
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type FeedTopicMatchInput = {
  kind?: "event" | "movie_showtime" | "recommendation";
  categories: string[];
  tags?: string[] | null;
  isFree?: boolean;
  source?: string | null;
  title?: string | null;
  venueName?: string | null;
  /** food_deals dealKind, etc. */
  rawPayload?: Record<string, unknown> | null;
};

const FESTIVAL_RE =
  /\b(festival|street fair|streetfair|block party|night market|carnival|fair)\b/i;
/** Sport signals — not bare "vs." (battle raps, mashups, "80s vs 90s"). */
const SPORTS_RE =
  /\b(sports?|game day|baseball|basketball|football|soccer|hockey|volleyball|giants|warriors|49ers|athletics|sharks)\b/i;

/** Sports listing (TM games, tagged sports) — not music/comedy battles. */
export function isSportsListing(item: FeedTopicMatchInput): boolean {
  const cats = item.categories;
  // Music / comedy never count as sports ("Artist A vs. B", genre nights).
  if (cats.some((c) => c.startsWith("music.") || c.startsWith("comedy."))) {
    return false;
  }
  if (item.source === "19hz" || item.source === "ra") return false;

  const tags = (item.tags ?? []).map((t) => normalizeTagToken(t));
  const title = (item.title ?? "").toLowerCase();
  const tagBlob = tags.join(" ");
  return (
    tags.includes("sports") ||
    SPORTS_RE.test(tagBlob) ||
    SPORTS_RE.test(title) ||
    (cats.includes("outdoors") && /\bsport/i.test(tagBlob))
  );
}

/** Concert / DJ / live-music listing — safe for Spotify-style listen links. */
export function isMusicListing(item: FeedTopicMatchInput): boolean {
  if (isSportsListing(item)) return false;
  const cats = item.categories;
  if (cats.some((c) => c.startsWith("music."))) return true;
  if (item.source === "19hz" || item.source === "ra") return true;
  return false;
}

/** Whether a feed row matches a topic chip (OR across selected topics at filter time) */
export function matchesFeedTopic(
  topic: FeedTopic,
  item: FeedTopicMatchInput,
): boolean {
  const cats = item.categories;
  const tags = (item.tags ?? []).map((t) => normalizeTagToken(t));
  const title = (item.title ?? "").toLowerCase();
  const venue = (item.venueName ?? "").toLowerCase();
  const tagBlob = tags.join(" ");
  const text = `${title} ${tagBlob} ${venue}`;

  switch (topic) {
    case "concerts":
      if (isMusicListing(item)) return true;
      if (/\b(concert|live music|tour\b|dj set|\bdj\b)\b/i.test(text)) return true;
      if (
        /\b(rock|pop|jazz|hip hop|hip-hop|rap|metal|punk|indie|alternative|soul|r&b|country|folk)\b/i.test(
          tagBlob,
        )
      ) {
        return true;
      }
      for (const hint of VENUE_TYPE_HINTS) {
        if (hint.kind === "music" && hint.re.test(venue)) return true;
      }
      return false;
    case "comedy":
      if (cats.some((c) => c.startsWith("comedy."))) return true;
      if (item.source === "comedy_venue" || item.source === "recurring") {
        return true;
      }
      if (/\b(comedy|standup|stand-up|stand up|improv|open mic)\b/i.test(text)) {
        return true;
      }
      for (const hint of VENUE_TYPE_HINTS) {
        if (hint.kind === "comedy" && hint.re.test(venue)) return true;
      }
      return false;
    case "movies":
      return (
        item.kind === "movie_showtime" ||
        cats.some((c) => c.startsWith("movies"))
      );
    case "sports":
      return isSportsListing(item);
    case "festivals":
      return FESTIVAL_RE.test(tagBlob) || FESTIVAL_RE.test(title);
    case "free":
      return item.isFree === true || cats.includes("free");
    case "happy_hours":
      return (
        item.source === "food_deals" &&
        item.rawPayload?.dealKind !== "lunch"
      );
    case "food":
      return (
        cats.includes("food") ||
        item.source === "food" ||
        item.source === "food_deals" ||
        item.source === "new_restaurants" ||
        item.source === "instagram"
      );
    case "nightlife":
      return cats.includes("nightlife") || tags.includes("bars");
    case "arts":
      return (
        cats.includes("arts") ||
        /\b(theatre|theater|museum|gallery|exhibit|dance|ballet|opera)\b/i.test(
          tagBlob,
        ) ||
        /\b(theatre|theater|museum|gallery|exhibit)\b/i.test(title)
      );
    case "activities":
      return item.source === "activities";
    default:
      return false;
  }
}

export function matchesAnyFeedTopic(
  topics: FeedTopic[],
  item: FeedTopicMatchInput,
): boolean {
  if (!topics.length) return true;
  return topics.some((t) => matchesFeedTopic(t, item));
}

/** Topics that match at least one card — for map/filter carousels. */
export function topicsPresentInCards(
  cards: FeedTopicMatchInput[],
): FeedTopic[] {
  return FEED_TOPICS.filter((topic) =>
    cards.some((card) => matchesFeedTopic(topic, card)),
  );
}

/** Ticketing / registration availability (Luma and future sources) */
export const REGISTRATION_STATUSES = [
  "open",
  "near_capacity",
  "waitlist",
  "sold_out",
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  open: "Open",
  near_capacity: "Few left",
  waitlist: "Waitlist",
  sold_out: "Sold out",
};

export function registrationStatusLabel(
  status: string | null | undefined,
): string | null {
  if (!status) return null;
  return REGISTRATION_STATUS_LABELS[status as RegistrationStatus] ?? status;
}

export const SIGNAL_TYPES = ["saved", "dismissed", "going", "opened"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const FEED_KINDS = ["event", "movie_showtime", "recommendation"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

/** Stored on `events.kind` — evergreen tips vs timed listings. */
export const EVENT_KINDS = ["event", "recommendation"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const SF_DEFAULT = {
  metro: "sf",
  lat: 37.7749,
  lng: -122.4194,
  zip: "94107",
  timezone: "America/Los_Angeles",
  radiusMiles: 15,
} as const;

export const CHI_DEFAULT = {
  metro: "chicago",
  lat: 41.8781,
  lng: -87.6298,
  zip: "60601",
  timezone: "America/Chicago",
  radiusMiles: 15,
} as const;

export const LA_DEFAULT = {
  metro: "la",
  lat: 34.0522,
  lng: -118.2437,
  zip: "90012",
  timezone: "America/Los_Angeles",
  radiusMiles: 25,
} as const;

/** Top-level city / metro selector */
export const FEED_CITIES = ["sf", "chicago", "la"] as const;
export type FeedCity = (typeof FEED_CITIES)[number];

export const FEED_CITY_LABELS: Record<FeedCity, string> = {
  sf: "San Francisco",
  chicago: "Chicago",
  la: "Los Angeles",
};

/** Metro name in tastes onboarding copy (SF spans East Bay / Peninsula chips). */
export const TASTES_METRO_LABELS: Record<FeedCity, string> = {
  sf: "SF / Bay",
  chicago: "Chicago",
  la: "Los Angeles",
};

/** Hint under neighborhood chips on Edit tastes — reflects active feed metro. */
export function tastesNeighborhoodHint(city: FeedCity): string {
  return `${TASTES_METRO_LABELS[city]} — switch city on the feed to edit the other metro.`;
}

/** SF / Bay onboarding neighborhood chips (also used as legacy flat list). */
export const NEIGHBORHOODS = [
  "Mission",
  "North Beach",
  "SOMA",
  "Hayes Valley",
  "Castro",
  "Haight",
  "Richmond",
  "Sunset",
  "Marina",
  "Downtown",
  "Oakland",
  "Berkeley",
  "East Bay",
  "Peninsula",
  "South Bay",
] as const;

/** Chicago onboarding neighborhood chips — keep names aligned with ingest labels. */
export const CHI_NEIGHBORHOODS = [
  "Wicker Park",
  "Logan Square",
  "Lincoln Park",
  "Lakeview",
  "River North",
  "West Loop",
  "The Loop",
  "Hyde Park",
  "Pilsen",
  "Bridgeport",
  "Andersonville",
  "Bucktown",
  "Uptown",
  "South Loop",
  "Gold Coast",
  "Streeterville",
  "Fulton Market",
  "Chinatown",
  "Evanston",
  "Oak Park",
] as const;

/** Los Angeles onboarding neighborhood chips — align with ingest labels. */
export const LA_NEIGHBORHOODS = [
  "Hollywood",
  "West Hollywood",
  "Silver Lake",
  "Echo Park",
  "Los Feliz",
  "Downtown",
  "Arts District",
  "Koreatown",
  "Mid-Wilshire",
  "Culver City",
  "Santa Monica",
  "Venice",
  "Pasadena",
  "Highland Park",
  "Beverly Hills",
  "Westwood",
  "Long Beach",
  "Glendale",
  "Burbank",
  "DTLA",
] as const;

/** Neighborhood picker options for a feed metro. */
export function neighborhoodsForCity(
  city: FeedCity,
): readonly string[] {
  if (city === "chicago") return CHI_NEIGHBORHOODS;
  if (city === "la") return LA_NEIGHBORHOODS;
  return NEIGHBORHOODS;
}

/** Default selected neighborhoods when tastes are empty for a metro. */
export function defaultNeighborhoodsForCity(city: FeedCity): string[] {
  if (city === "chicago")
    return ["Wicker Park", "Logan Square", "West Loop"];
  if (city === "la")
    return ["Silver Lake", "Hollywood", "Downtown"];
  return ["Mission", "North Beach"];
}

/** Geographic scope for feed filtering */
export const FEED_AREAS = ["sf", "bay", "chicago", "la"] as const;
export type FeedArea = (typeof FEED_AREAS)[number];

export const FEED_MODES = ["for_you", "today", "weekend", "date"] as const;
export type FeedMode = (typeof FEED_MODES)[number];

/** Map legacy mode query/session values to current FEED_MODES. */
export function normalizeFeedMode(
  value: string | null | undefined,
): FeedMode {
  if (value === "tonight") return "today";
  if (value === "all") return "date";
  return FEED_MODES.includes(value as FeedMode)
    ? (value as FeedMode)
    : "today";
}

/** Cold-start / no-URL default: For you only when tastes exist. */
export function defaultFeedMode(opts?: {
  authenticated?: boolean;
  onboardingComplete?: boolean;
}): FeedMode {
  return opts?.authenticated && opts?.onboardingComplete ? "for_you" : "today";
}

/** Modes that may carry an optional `date=YYYY-MM-DD` filter. */
export function feedModeAllowsDate(mode: FeedMode): boolean {
  return mode === "today" || mode === "weekend" || mode === "date";
}

const SF_CITIES = new Set([
  "sf",
  "san_francisco",
  "san francisco",
  "san-francisco",
]);

const BAY_CITIES = new Set([
  ...SF_CITIES,
  "oakland",
  "berkeley",
  "albany",
  "emeryville",
  "alameda",
  "san_jose",
  "san jose",
  "santa_clara",
  "palo_alto",
  "mountain_view",
  "sunnyvale",
  "redwood_city",
  "san_mateo",
  "daly_city",
  "south_bay",
  "east_bay",
  "peninsula",
  "marin",
  "sausalito",
  "richmond_ca",
  "walnut_creek",
  "concord",
  "fremont",
  "hayward",
  // Peninsula / South Bay towns that show up on Luma SF discover
  "atherton",
  "menlo_park",
  "san_carlos",
  "belmont",
  "stanford",
  "san_bruno",
  "millbrae",
  "burlingame",
  "foster_city",
  "cupertino",
  "los_altos",
  "los_gatos",
  "campbell",
  "milpitas",
  "santa_cruz",
  "half_moon_bay",
  "pacifica",
  "south_san_francisco",
  "brisbane",
  "colma",
  "san_rafael",
  "mill_valley",
  "tiburon",
  "corte_madera",
  "larkspur",
  "richmond",
  "el_cerrito",
  "san_leandro",
  "san_lorenzo",
  "union_city",
  "newark",
  "pleasanton",
  "livermore",
  "dublin",
]);

const CHI_CITIES = new Set([
  "chicago",
  "chi",
  "evanston",
  "oak_park",
  "oak park",
  "cicero",
  "berwyn",
  "skokie",
  "lincolnwood",
  "wilmette",
  "winnetka",
  "glencoe",
  "highland_park",
  "park_ridge",
  "des_plaines",
  "niles",
  "morton_grove",
  "forest_park",
  "river_forest",
  "elmwood_park",
  "naperville",
  "aurora",
  "joliet",
  "schaumburg",
  "arlington_heights",
  "downers_grove",
  "oak_brook",
  "lombard",
  "wheaton",
  "hyde_park",
  "pilsen",
  "wicker_park",
  "logan_square",
  "lincoln_park",
  "lakeview",
  "bridgeport",
  "chinatown_chi",
]);

const LA_CITIES = new Set([
  "la",
  "los_angeles",
  "los angeles",
  "hollywood",
  "west_hollywood",
  "santa_monica",
  "pasadena",
  "burbank",
  "glendale",
  "long_beach",
  "culver_city",
  "venice",
  "silver_lake",
  "echo_park",
  "los_feliz",
  "koreatown",
  "beverly_hills",
  "westwood",
  "highland_park",
  "dtla",
  "downtown_la",
  "inglewood",
  "torrance",
  "redondo_beach",
  "manhattan_beach",
  "hermosa_beach",
  "el_segundo",
  "marina_del_rey",
  "malibu",
  "anaheim",
  "irvine",
  "orange_county",
]);

const SF_NEIGHBORHOODS = new Set([
  "Mission",
  "North Beach",
  "SOMA",
  "Hayes Valley",
  "Castro",
  "Haight",
  "Richmond",
  "Sunset",
  "Marina",
  "Downtown",
  "Mid-Market",
  "Dogpatch",
  "Potrero",
  "Noe Valley",
  "Excelsior",
  "Bayview",
  "Tenderloin",
  "Financial District",
  "Chinatown",
  "Japantown",
  "Union Square",
]);

const LA_NEIGHBORHOOD_LABELS = new Set([
  ...LA_NEIGHBORHOODS,
  "Mid-Wilshire",
  "Arts District",
]);

/** Lowercase underscore key for city comparisons */
export function normalizeCity(city?: string | null): string {
  return (city ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
}

/**
 * Canonical city key for storage + area filters.
 * Maps "San Francisco" → "sf", "Chicago" → "chicago", "Atherton" → "atherton".
 */
export function cityKeyFromLabel(raw?: string | null): string {
  const key = normalizeCity(raw);
  if (!key) return "sf";
  if (SF_CITIES.has(key) || key === "san_francisco") return "sf";
  if (CHI_CITIES.has(key) || key === "chicago") return "chicago";
  if (LA_CITIES.has(key)) return "la";
  return key;
}

export function metroFromArea(area: FeedArea): FeedCity {
  if (area === "chicago") return "chicago";
  if (area === "la") return "la";
  return "sf";
}

export function defaultAreaForCity(city: FeedCity): FeedArea {
  if (city === "chicago") return "chicago";
  if (city === "la") return "la";
  return "bay";
}

export function areasForCity(city: FeedCity): readonly FeedArea[] {
  if (city === "chicago") return ["chicago"] as const;
  if (city === "la") return ["la"] as const;
  return ["sf", "bay"] as const;
}

export function feedFilterSourcesForCity(
  city: FeedCity,
): readonly FeedFilterSource[] {
  if (city === "chicago") return CHI_FEED_FILTER_SOURCES;
  if (city === "la") return LA_FEED_FILTER_SOURCES;
  return SF_FEED_FILTER_SOURCES;
}

export function locationDefaultForArea(area: FeedArea) {
  if (area === "chicago") return CHI_DEFAULT;
  if (area === "la") return LA_DEFAULT;
  return SF_DEFAULT;
}

export function eventInArea(
  area: FeedArea,
  opts: { city?: string | null; neighborhood?: string | null },
): boolean {
  const city = normalizeCity(opts.city);
  const neighborhood = opts.neighborhood?.trim() ?? "";
  const cityIsSf = !city || SF_CITIES.has(city);
  const hoodIsSf = Boolean(neighborhood && SF_NEIGHBORHOODS.has(neighborhood));
  const cityIsChi = CHI_CITIES.has(city);
  const cityIsLa = LA_CITIES.has(city);
  const hoodIsLa = Boolean(
    neighborhood && LA_NEIGHBORHOOD_LABELS.has(neighborhood),
  );

  if (area === "la") {
    if (cityIsLa) return true;
    if (!city) return false;
    if (SF_CITIES.has(city) || BAY_CITIES.has(city) || cityIsChi) return false;
    if (/los angeles|hollywood|santa monica/i.test(neighborhood)) return true;
    if (hoodIsLa) return true;
    return false;
  }

  if (area === "chicago") {
    if (cityIsChi) return true;
    if (!city) return false;
    // Explicit non-Chicago city → exclude
    if (SF_CITIES.has(city) || BAY_CITIES.has(city)) return false;
    // Unknown suburb labels still count if they mention Chicago in neighborhood
    if (/chicago/i.test(neighborhood)) return true;
    return false;
  }

  // SF / Bay — never mix in Chicago or LA rows
  if (cityIsChi || cityIsLa) return false;

  if (area === "sf") {
    // Explicit non-SF city (e.g. Atherton from Luma) → exclude from All SF
    if (city && !SF_CITIES.has(city)) return false;
    if (cityIsSf) return true;
    if (hoodIsSf) return true;
    return !opts.city;
  }

  // bay — SF + known Bay cities; unknown/missing still kept (except Chicago)
  if (cityIsSf || BAY_CITIES.has(city)) return true;
  if (
    neighborhood &&
    (hoodIsSf ||
      [
        "Oakland",
        "Berkeley",
        "East Bay",
        "Peninsula",
        "South Bay",
        "Atherton",
        "Palo Alto",
        "Menlo Park",
      ].includes(neighborhood))
  ) {
    return true;
  }
  return !opts.city || city === "";
}
