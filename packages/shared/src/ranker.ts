import { isHappeningNow } from "./datetime";
import type { FeedCard, UserPrefs } from "./schemas";

const ADJACENT: Record<string, string[]> = {
  "music.electronic": [
    "music.live",
    "nightlife",
    "music.house",
    "music.tech_house",
    "music.techno",
    "music.drum_and_bass",
    "music.bass",
    "music.trance",
  ],
  "music.live": ["music.electronic", "music.jazz", "music.hip_hop"],
  "music.jazz": ["music.live", "music.electronic"],
  "music.house": [
    "music.tech_house",
    "music.techno",
    "music.electronic",
    "nightlife",
    "music.latin",
  ],
  "music.tech_house": ["music.house", "music.techno", "music.electronic"],
  "music.techno": [
    "music.house",
    "music.tech_house",
    "music.electronic",
    "nightlife",
  ],
  "music.drum_and_bass": ["music.bass", "music.electronic", "nightlife"],
  "music.bass": ["music.drum_and_bass", "music.electronic", "nightlife"],
  "music.trance": ["music.electronic", "music.techno"],
  "music.hip_hop": ["music.live", "nightlife", "music.bass"],
  "music.latin": ["music.house", "music.electronic", "nightlife"],
  "comedy.club": ["comedy.showcase", "comedy.underground"],
  "comedy.showcase": ["comedy.club", "comedy.open_mic"],
  "comedy.open_mic": ["comedy.underground", "comedy.showcase"],
  "comedy.underground": ["comedy.open_mic", "comedy.club"],
  movies: ["movies.arthouse", "movies.blockbuster"],
  "movies.arthouse": ["movies", "arts"],
  "movies.blockbuster": ["movies", "nightlife"],
  tech: ["arts", "food"],
  food: ["nightlife", "free"],
  free: ["outdoors", "arts"],
};

function interestMap(prefs: UserPrefs): Map<string, number> {
  return new Map(prefs.interests.map((i) => [i.category, i.weight]));
}

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type Rankable = {
  id: string;
  kind: "event" | "movie_showtime" | "recommendation";
  title: string;
  categories: string[];
  /** Free-form style tags (19hz genres, etc.) — shown on feed cards */
  tags?: string[];
  startsAt: Date;
  endsAt?: Date | null;
  lat?: number | null;
  lng?: number | null;
  isFree?: boolean;
  priceMin?: number | null;
  neighborhood?: string | null;
  venueName?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  subtitle?: string | null;
  filmId?: string;
  ratings?: FeedCard["ratings"];
  showtimesPreview?: FeedCard["showtimesPreview"];
  source?: string | null;
  registrationStatus?: FeedCard["registrationStatus"];
  /** FOUND section · series framing for food tips */
  recommendationLabel?: string | null;
  sourceTrust?: number;
  city?: string | null;
};

export type RankContext = {
  prefs: UserPrefs;
  now?: Date;
  dismissedIds?: Set<string>;
  savedBoostIds?: Set<string>;
  /** Skip budget/free hard filters and distance radius cuts */
  showAll?: boolean;
};

const CURATED_TIP_SOURCES = new Set([
  "food",
  "food_deals",
  "new_restaurants",
  "activities",
]);

/** Editorial tips / reels — not ticketed events; skip free-only and budget hard filters. */
function isRecommendationTip(item: Rankable): boolean {
  if (item.recommendationLabel) return true;
  if (item.source && CURATED_TIP_SOURCES.has(item.source)) return true;
  if (item.source === "instagram" && item.categories.includes("food")) {
    return true;
  }
  return false;
}

function categoryScore(categories: string[], interests: Map<string, number>) {
  let affinity = 0;
  let adjacent = 0;
  for (const cat of categories) {
    affinity = Math.max(affinity, interests.get(cat) ?? 0);
    for (const [want, weight] of interests) {
      if ((ADJACENT[want] ?? []).includes(cat)) {
        adjacent = Math.max(adjacent, weight * 0.55);
      }
    }
  }
  return { affinity, adjacent };
}

function timeScore(
  startsAt: Date,
  now: Date,
  mode: "tonight" | "weekend" | "for_you" | "all",
) {
  const hours = (startsAt.getTime() - now.getTime()) / 3600000;
  if (hours < -1) return -10;
  if (mode === "all") {
    if (hours < 24) return 1;
    if (hours < 72) return 0.85;
    if (hours < 168) return 0.7;
    return 0.5;
  }
  if (mode === "tonight") {
    if (hours <= 12) return 1;
    if (hours <= 24) return 0.4;
    return 0.05;
  }
  if (mode === "weekend") {
    const day = startsAt.getDay();
    const isWeekendish = day === 5 || day === 6 || day === 0;
    return isWeekendish && hours < 96 ? 1 : 0.2;
  }
  if (hours < 48) return 0.9;
  if (hours < 168) return 0.6;
  return 0.25;
}

function toCard(s: {
  kind: Rankable["kind"];
  id: string;
  title: string;
  subtitle?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  imageUrl?: string | null;
  venueName?: string | null;
  neighborhood?: string | null;
  categories: string[];
  tags?: string[];
  isFree?: boolean;
  url?: string | null;
  source?: string | null;
  registrationStatus?: FeedCard["registrationStatus"];
  score: number;
  bucket: FeedCard["bucket"];
  filmId?: string;
  ratings?: FeedCard["ratings"];
  showtimesPreview?: FeedCard["showtimesPreview"];
  recommendationLabel?: string | null;
}): FeedCard {
  return {
    kind: s.kind,
    id: s.id,
    title: s.title,
    subtitle: s.subtitle ?? null,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt ? s.endsAt.toISOString() : null,
    imageUrl: s.imageUrl ?? null,
    venueName: s.venueName ?? null,
    neighborhood: s.neighborhood ?? null,
    categories: s.categories,
    tags: s.tags?.length ? s.tags : undefined,
    source: s.source ?? null,
    registrationStatus: s.registrationStatus ?? null,
    isFree: s.isFree,
    url: s.url ?? null,
    score: Number(s.score.toFixed(4)),
    bucket: s.bucket,
    filmId: s.filmId,
    ratings: s.ratings,
    showtimesPreview: s.showtimesPreview,
    recommendationLabel: s.recommendationLabel ?? null,
  };
}

export function rankFeed(
  items: Rankable[],
  ctx: RankContext,
  mode: "tonight" | "weekend" | "for_you" | "all" = "for_you",
  limit = 40,
): FeedCard[] {
  const now = ctx.now ?? new Date();
  const interests = interestMap(ctx.prefs);
  const lat = ctx.prefs.lat ?? 37.7749;
  const lng = ctx.prefs.lng ?? -122.4194;
  const radius = ctx.prefs.radiusMiles ?? 15;
  const dismissed = ctx.dismissedIds ?? new Set();
  const saved = ctx.savedBoostIds ?? new Set();
  const showAll = ctx.showAll || mode === "all";

  type Scored = Rankable & {
    score: number;
    bucket: FeedCard["bucket"];
    affinity: number;
    adjacent: number;
  };

  const scored: Scored[] = [];

  for (const item of items) {
    if (dismissed.has(item.id)) continue;
    if (!showAll && item.lat != null && item.lng != null) {
      const miles = haversineMiles(lat, lng, item.lat, item.lng);
      if (miles > radius * 1.5) continue;
    }
    if (
      !showAll &&
      ctx.prefs.preferFree &&
      !item.isFree &&
      !isRecommendationTip(item)
    ) {
      continue;
    }
    if (
      !showAll &&
      ctx.prefs.budgetMax != null &&
      item.priceMin != null &&
      item.priceMin > ctx.prefs.budgetMax &&
      !isRecommendationTip(item)
    ) {
      continue;
    }

    const { affinity, adjacent } = categoryScore(item.categories, interests);
    const t = timeScore(item.startsAt, now, mode);
    let distanceBoost = 0.3;
    if (item.lat != null && item.lng != null) {
      const miles = haversineMiles(lat, lng, item.lat, item.lng);
      distanceBoost = Math.max(0, 1 - miles / Math.max(radius, 1));
    }
    const neighborhoodBoost =
      item.neighborhood && ctx.prefs.neighborhoods.includes(item.neighborhood)
        ? 0.15
        : 0;
    const trust = item.sourceTrust ?? 0.7;
    const ratingBoost =
      item.ratings?.imdb != null
        ? Math.min(0.2, (item.ratings.imdb - 6) / 20)
        : item.ratings?.infatuation != null
          ? Math.min(0.2, (item.ratings.infatuation - 6) / 20)
          : 0;
    const saveBoost =
      saved.has(item.id) || (item.filmId && saved.has(item.filmId)) ? 0.25 : 0;
    const registrationPenalty =
      item.registrationStatus === "sold_out"
        ? 0.4
        : item.registrationStatus === "waitlist"
          ? 0.18
          : item.registrationStatus === "near_capacity"
            ? 0.05
            : 0;

    const primary = Math.max(affinity, adjacent * 0.9);

    const score = showAll
      ? t * 0.7 + primary * 0.2 + distanceBoost * 0.1 + saveBoost - registrationPenalty
      : primary * 0.45 +
        t * 0.25 +
        distanceBoost * 0.15 +
        neighborhoodBoost +
        trust * 0.08 +
        ratingBoost +
        saveBoost -
        registrationPenalty;

    let bucket: FeedCard["bucket"] = "serendipity";
    if (affinity >= 0.55) bucket = "affinity";
    else if (adjacent >= 0.35 || affinity >= 0.25) bucket = "adjacent";

    scored.push({ ...item, score, bucket, affinity, adjacent });
  }

  if (showAll) {
    scored.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    if (scored.length <= limit) return scored.map(toCard);

    // Prefer live + upcoming so a busy morning doesn't crowd out tonight.
    const liveOrUpcoming: Scored[] = [];
    const earlier: Scored[] = [];
    for (const s of scored) {
      if (
        s.startsAt.getTime() >= now.getTime() ||
        isHappeningNow(s.startsAt, s.endsAt ?? null, now)
      ) {
        liveOrUpcoming.push(s);
      } else {
        earlier.push(s);
      }
    }
    if (liveOrUpcoming.length >= limit) {
      return liveOrUpcoming.slice(0, limit).map(toCard);
    }
    const earlierTake = earlier.slice(-(limit - liveOrUpcoming.length));
    return [...earlierTake, ...liveOrUpcoming].map(toCard);
  }

  scored.sort((a, b) => b.score - a.score);

  const affinitySlots = Math.ceil(limit * 0.65);
  const adjacentSlots = Math.ceil(limit * 0.25);
  const serendipitySlots = Math.max(1, limit - affinitySlots - adjacentSlots);

  const pick = (bucket: FeedCard["bucket"], n: number, exclude: Set<string>) => {
    const out: Scored[] = [];
    for (const s of scored) {
      if (out.length >= n) break;
      if (exclude.has(s.id)) continue;
      if (s.bucket !== bucket && bucket !== "serendipity") continue;
      if (bucket === "serendipity" && s.bucket === "affinity" && s.affinity > 0.7) {
        continue;
      }
      out.push(s);
      exclude.add(s.id);
    }
    return out;
  };

  const used = new Set<string>();
  const selected = [
    ...pick("affinity", affinitySlots, used),
    ...pick("adjacent", adjacentSlots, used),
    ...pick("serendipity", serendipitySlots, used),
  ];

  for (const s of scored) {
    if (selected.length >= limit) break;
    if (used.has(s.id)) continue;
    selected.push(s);
    used.add(s.id);
  }

  selected.sort((a, b) => b.score - a.score);
  return selected.slice(0, limit).map(toCard);
}
