import { exceedsBudget, formatEventPriceLabel } from "./budget";
import { dayCardLabel, dayKey } from "./datetime";
import {
  exhibitionTimeScorePenalty,
  isFeedEventLive,
} from "./exhibitions";
import {
  takeWithVenueCaps,
  type FeedDemotionRule,
  resolveDemotion,
} from "./feedDemotion";
import { haversineMiles } from "./geo";
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
  "music.live": [
    "music.electronic",
    "music.rock",
    "music.indie",
    "music.jazz",
    "music.hip_hop",
    "music.pop",
    "music.blues",
  ],
  "music.jazz": ["music.live", "music.blues", "music.rnb", "music.soul"],
  "music.rock": ["music.live", "music.indie", "music.punk", "music.metal", "music.blues"],
  "music.indie": ["music.live", "music.rock", "music.folk", "music.pop"],
  "music.punk": ["music.live", "music.rock", "music.metal", "music.indie"],
  "music.metal": ["music.live", "music.rock", "music.punk"],
  "music.blues": ["music.live", "music.jazz", "music.rock", "music.rnb", "music.soul"],
  "music.folk": ["music.live", "music.indie", "music.country", "music.blues"],
  "music.country": ["music.live", "music.folk", "music.blues"],
  "music.pop": ["music.live", "music.indie", "music.rnb", "music.hip_hop"],
  "music.rnb": ["music.live", "music.soul", "music.funk", "music.hip_hop", "music.jazz", "music.pop"],
  "music.soul": ["music.live", "music.rnb", "music.funk", "music.jazz", "music.blues"],
  "music.funk": ["music.live", "music.soul", "music.rnb", "music.jazz", "music.hip_hop"],
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
  "music.hip_hop": ["music.live", "nightlife", "music.bass", "music.rnb", "music.funk"],
  "music.latin": ["music.live", "music.house", "music.electronic", "nightlife"],
  "comedy.club": ["comedy.showcase", "comedy.underground"],
  "comedy.showcase": ["comedy.club", "comedy.open_mic"],
  "comedy.open_mic": ["comedy.underground", "comedy.showcase"],
  "comedy.underground": ["comedy.open_mic", "comedy.club"],
  movies: ["movies.arthouse", "movies.blockbuster"],
  "movies.arthouse": ["movies", "arts"],
  "movies.blockbuster": ["movies", "nightlife"],
  tech: ["business", "arts"],
  business: ["tech", "food"],
  food: ["nightlife", "free"],
  outdoors: ["wellness", "free"],
  wellness: ["outdoors", "family"],
  free: ["outdoors", "arts"],
};

function interestMap(prefs: UserPrefs): Map<string, number> {
  return new Map(prefs.interests.map((i) => [i.category, i.weight]));
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
  priceMax?: number | null;
  neighborhood?: string | null;
  venueName?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  subtitle?: string | null;
  filmId?: string;
  ratings?: FeedCard["ratings"];
  showtimesPreview?: FeedCard["showtimesPreview"];
  showtimesMoreCount?: number;
  source?: string | null;
  rawPayload?: unknown;
  registrationStatus?: FeedCard["registrationStatus"];
  /** FOUND section · series framing for food tips */
  recommendationLabel?: string | null;
  sourceTrust?: number;
  city?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  /** IG/YouTube publish time when known. */
  publishedAt?: Date | null;
  isSponsored?: boolean;
  boostWeight?: number;
  sponsorEndsAt?: Date | string | null;
};

export type RankContext = {
  prefs: UserPrefs;
  now?: Date;
  dismissedIds?: Set<string>;
  savedBoostIds?: Set<string>;
  /** Skip budget/free hard filters and distance radius cuts */
  showAll?: boolean;
  /** Ops demotion rules (score bury + optional per-venue cap) */
  demotionRules?: FeedDemotionRule[];
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
  if (item.source === "youtube" && item.categories.includes("food")) {
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

/** Partiful "Trending in the Bay" (and similar) — social-proof discovery signal. */
function isTrendingTag(tags: string[] | undefined): boolean {
  if (!tags?.length) return false;
  return tags.some((t) => t.trim().toLowerCase() === "trending");
}

function timeScore(
  startsAt: Date,
  now: Date,
  mode: "for_you" | "today" | "weekend" | "date",
) {
  const hours = (startsAt.getTime() - now.getTime()) / 3600000;
  if (hours < -1) return -10;
  if (mode === "date" || mode === "today") {
    if (hours < 24) return 1;
    if (hours < 72) return 0.85;
    if (hours < 168) return 0.7;
    return 0.5;
  }
  if (mode === "weekend") {
    const day = startsAt.getDay();
    const isWeekendish = day === 5 || day === 6 || day === 0;
    return isWeekendish && hours < 96 ? 1 : 0.2;
  }
  // for_you: prefer soon, keep mid-horizon visible
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
  lat?: number | null;
  lng?: number | null;
  categories: string[];
  tags?: string[];
  isFree?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  url?: string | null;
  source?: string | null;
  registrationStatus?: FeedCard["registrationStatus"];
  score: number;
  bucket: FeedCard["bucket"];
  filmId?: string;
  ratings?: FeedCard["ratings"];
  showtimesPreview?: FeedCard["showtimesPreview"];
  showtimesMoreCount?: number;
  recommendationLabel?: string | null;
  isSponsored?: boolean;
  boostWeight?: number;
  mediaUrl?: string | null;
  mediaType?: string | null;
  publishedAt?: Date | null;
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
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    categories: s.categories,
    tags: s.tags?.length ? s.tags : undefined,
    source: s.source ?? null,
    registrationStatus: s.registrationStatus ?? null,
    isFree: s.isFree,
    priceLabel: formatEventPriceLabel({
      isFree: s.isFree,
      priceMin: s.priceMin,
      priceMax: s.priceMax,
      tags: s.tags,
      source: s.source,
    }),
    url: s.url ?? null,
    score: Number(s.score.toFixed(4)),
    bucket: s.bucket,
    filmId: s.filmId,
    ratings: s.ratings,
    showtimesPreview: s.showtimesPreview,
    showtimesMoreCount: s.showtimesMoreCount,
    recommendationLabel: s.recommendationLabel ?? null,
    isSponsored: s.isSponsored || undefined,
    boostWeight: s.boostWeight,
    mediaUrl: s.mediaUrl ?? null,
    mediaType: s.mediaType ?? null,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
  };
}

export function rankFeed(
  items: Rankable[],
  ctx: RankContext,
  mode: "for_you" | "today" | "weekend" | "date" = "for_you",
  limit = 40,
): FeedCard[] {
  const now = ctx.now ?? new Date();
  const interests = interestMap(ctx.prefs);
  const lat = ctx.prefs.lat ?? 37.7749;
  const lng = ctx.prefs.lng ?? -122.4194;
  const radius = ctx.prefs.radiusMiles ?? 15;
  const dismissed = ctx.dismissedIds ?? new Set();
  const saved = ctx.savedBoostIds ?? new Set();
  const showAll = ctx.showAll || mode === "date" || mode === "today";

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
    if (!showAll && exceedsBudget(item, ctx.prefs)) {
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
    const trendingBoost = isTrendingTag(item.tags) ? 0.32 : 0;
    const registrationPenalty =
      item.registrationStatus === "sold_out"
        ? 0.4
        : item.registrationStatus === "waitlist"
          ? 0.18
          : item.registrationStatus === "near_capacity"
            ? 0.05
            : 0;

    const primary = Math.max(affinity, adjacent * 0.9);
    const exhibitionPenalty = exhibitionTimeScorePenalty(item.tags, item.rawPayload);
    const demotion = resolveDemotion(item, ctx.demotionRules);

    const rawScore = showAll
      ? t * 0.7 +
        primary * 0.2 +
        distanceBoost * 0.1 +
        saveBoost +
        trendingBoost -
        registrationPenalty -
        exhibitionPenalty
      : primary * 0.45 +
        t * 0.25 +
        distanceBoost * 0.15 +
        neighborhoodBoost +
        trust * 0.08 +
        ratingBoost +
        saveBoost +
        trendingBoost -
        registrationPenalty -
        exhibitionPenalty;

    const score = rawScore * demotion.scoreMultiplier;

    let bucket: FeedCard["bucket"] = "serendipity";
    if (affinity >= 0.55) bucket = "affinity";
    else if (adjacent >= 0.35 || affinity >= 0.25 || trendingBoost > 0) {
      bucket = "adjacent";
    }

    scored.push({ ...item, score, bucket, affinity, adjacent });
  }

  if (showAll) {
    scored.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    // Prefer live + upcoming so a busy morning doesn't crowd out tonight.
    const liveOrUpcoming: Scored[] = [];
    const earlier: Scored[] = [];
    for (const s of scored) {
      if (
        s.startsAt.getTime() >= now.getTime() ||
        isFeedEventLive(s.startsAt, s.endsAt ?? null, now, {
          tags: s.tags,
          rawPayload: s.rawPayload,
        })
      ) {
        liveOrUpcoming.push(s);
      } else {
        earlier.push(s);
      }
    }

    const liveTake = takeWithVenueCaps(
      liveOrUpcoming,
      limit,
      ctx.demotionRules,
    );
    if (liveTake.length >= limit) {
      return liveTake.map(toCard);
    }
    const need = limit - liveTake.length;
    // Prefer the most recent earlier events (original slice(-need) behavior).
    const earlierNewestFirst = [...earlier].reverse();
    const earlierFillNewestFirst = takeWithVenueCaps(
      earlierNewestFirst,
      need,
      ctx.demotionRules,
      liveTake,
    );
    const earlierFill = [...earlierFillNewestFirst].reverse();
    return [...earlierFill, ...liveTake].map(toCard);
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
    if (selected.length >= limit * 2) break;
    if (used.has(s.id)) continue;
    selected.push(s);
    used.add(s.id);
  }

  selected.sort((a, b) => b.score - a.score);
  return takeWithVenueCaps(selected, limit, ctx.demotionRules).map((s) =>
    toCard({
      ...s,
      isSponsored: s.isSponsored,
      boostWeight: s.boostWeight,
    }),
  );
}

export type RankForYouTopicContext = RankContext & {
  /** Metro timezone for Today / weekend day boundaries. */
  timeZone: string;
};

/**
 * For You + topic chip: lead with Today matches, then This Weekend, then the
 * rest of the horizon — so a thin topic still fills from nearer windows first.
 *
 * Topic browse uses showAll (no budget/radius hard cull) — same idea as source chips.
 */
export function rankForYouTopicFeed(
  items: Rankable[],
  ctx: RankForYouTopicContext,
  limit = 40,
): FeedCard[] {
  const now = ctx.now ?? new Date();
  const tz = ctx.timeZone;
  const today = dayKey(now, tz);
  const browseCtx: RankContext = { ...ctx, showAll: true };

  const todayItems: Rankable[] = [];
  const weekendItems: Rankable[] = [];
  const restItems: Rankable[] = [];

  for (const item of items) {
    const key = dayKey(item.startsAt, tz);
    if (key === today) {
      todayItems.push(item);
      continue;
    }
    const label = dayCardLabel(key, tz, now);
    const upcomingOrLive =
      item.startsAt.getTime() >= now.getTime() ||
      isFeedEventLive(item.startsAt, item.endsAt ?? null, now, {
        tags: item.tags,
        rawPayload: item.rawPayload,
      });
    if (label.isWeekend && upcomingOrLive) {
      weekendItems.push(item);
    } else {
      restItems.push(item);
    }
  }

  const out: FeedCard[] = [];
  const used = new Set<string>();

  const appendRanked = (
    pool: Rankable[],
    mode: "for_you" | "today" | "weekend" | "date",
  ) => {
    if (out.length >= limit) return;
    const cards = rankFeed(
      pool.filter((i) => !used.has(i.id)),
      browseCtx,
      mode,
      limit - out.length,
    );
    for (const card of cards) {
      if (out.length >= limit) break;
      if (used.has(card.id)) continue;
      out.push(card);
      used.add(card.id);
    }
  };

  appendRanked(todayItems, "today");
  appendRanked(weekendItems, "weekend");
  appendRanked(restItems, "for_you");

  return out.slice(0, limit);
}
