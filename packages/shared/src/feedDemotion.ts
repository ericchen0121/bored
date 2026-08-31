/**
 * Ops demotion rules: soft-bury matching listings and optionally cap
 * how many cards from one venue appear in a single feed response.
 */

import {
  FEED_AREAS,
  FEED_CITIES,
  areasForCity,
  eventInArea,
  type FeedArea,
  type FeedCity,
} from "./taxonomy";

export type FeedDemotionRule = {
  id: string;
  name: string;
  /**
   * Metro filter: feed area (`sf` | `bay` | `chicago` | `la` | …), feed city
   * slug, or exact event `city`. Null/omit = all metros.
   * Matching uses `eventInArea` / `areasForCity` so new metros need no
   * demotion-specific city lists.
   */
  metro?: string | null;
  /** Exact source id; null/omit = any */
  source?: string | null;
  /** Case-insensitive substring on venueName */
  venueContains?: string | null;
  /** Case-insensitive substring on any category */
  categoryContains?: string | null;
  /** Organic score multiplier (0–1). */
  scoreMultiplier: number;
  /** Max cards from same venue in one feed; null = uncapped */
  maxPerVenue?: number | null;
  active?: boolean;
};

export type DemotionMatchable = {
  id: string;
  title?: string | null;
  source?: string | null;
  city?: string | null;
  venueName?: string | null;
  categories?: string[];
};

export type ResolvedDemotion = {
  /** Product of matching multipliers (clamped). */
  scoreMultiplier: number;
  /** Strictest maxPerVenue among matches; null if none set. */
  maxPerVenue: number | null;
  matchedRuleIds: string[];
};

const FEED_AREA_SET = new Set<string>(FEED_AREAS);
const FEED_CITY_SET = new Set<string>(FEED_CITIES);

export function normalizeVenueKey(venueName: string | null | undefined): string {
  return (venueName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether a demotion rule's metro field applies to an event city.
 * Prefers taxonomy (`eventInArea` / `areasForCity`) so new metros work
 * without updating this module.
 */
export function demotionMetroMatches(
  ruleMetro: string | null | undefined,
  city: string | null | undefined,
): boolean {
  if (!ruleMetro?.trim()) return true;
  const m = ruleMetro.trim().toLowerCase();
  const c = (city ?? "").trim().toLowerCase();
  if (!c) return true;
  if (m === c) return true;

  if (FEED_AREA_SET.has(m)) {
    return eventInArea(m as FeedArea, { city: c });
  }

  if (FEED_CITY_SET.has(m)) {
    return areasForCity(m as FeedCity).some((area) =>
      eventInArea(area, { city: c }),
    );
  }

  // Unknown slug: exact city match only (already checked).
  return false;
}

export function ruleMatchesItem(
  rule: FeedDemotionRule,
  item: DemotionMatchable,
): boolean {
  if (rule.active === false) return false;

  const hasConstraint =
    Boolean(rule.metro?.trim()) ||
    Boolean(rule.source?.trim()) ||
    Boolean(rule.venueContains?.trim()) ||
    Boolean(rule.categoryContains?.trim());
  if (!hasConstraint) return false;

  if (!demotionMetroMatches(rule.metro, item.city)) return false;

  if (rule.source?.trim()) {
    if ((item.source ?? "").toLowerCase() !== rule.source.trim().toLowerCase()) {
      return false;
    }
  }

  if (rule.venueContains?.trim()) {
    const needle = rule.venueContains.trim().toLowerCase();
    const venue = normalizeVenueKey(item.venueName);
    const title = (item.title ?? "").toLowerCase();
    // Funcheap often leaves venue_name null and only names the venue in the title.
    if (!venue.includes(needle) && !title.includes(needle)) return false;
  }

  if (rule.categoryContains?.trim()) {
    const needle = rule.categoryContains.trim().toLowerCase();
    const cats = item.categories ?? [];
    if (!cats.some((c) => c.toLowerCase().includes(needle))) return false;
  }

  return true;
}

/**
 * Resolve demotion for one item. Multiple matches → multiply scores
 * (clamped) and take the strictest venue cap.
 */
export function resolveDemotion(
  item: DemotionMatchable,
  rules: FeedDemotionRule[] | undefined | null,
): ResolvedDemotion {
  if (!rules?.length) {
    return { scoreMultiplier: 1, maxPerVenue: null, matchedRuleIds: [] };
  }

  let multiplier = 1;
  let maxPerVenue: number | null = null;
  const matchedRuleIds: string[] = [];

  for (const rule of rules) {
    if (!ruleMatchesItem(rule, item)) continue;
    matchedRuleIds.push(rule.id);
    const m =
      typeof rule.scoreMultiplier === "number" && Number.isFinite(rule.scoreMultiplier)
        ? Math.min(1, Math.max(0, rule.scoreMultiplier))
        : 1;
    multiplier *= m;
    if (rule.maxPerVenue != null && rule.maxPerVenue >= 0) {
      maxPerVenue =
        maxPerVenue == null
          ? rule.maxPerVenue
          : Math.min(maxPerVenue, rule.maxPerVenue);
    }
  }

  return {
    scoreMultiplier: Math.min(1, Math.max(0, multiplier)),
    maxPerVenue,
    matchedRuleIds,
  };
}

/**
 * Stable key for per-venue caps. Prefer real venueName; else the matching
 * rule's venueContains (so title-only Funcheap rows still share a bucket).
 */
export function venueCapKey(
  item: DemotionMatchable,
  rules: FeedDemotionRule[] | undefined | null,
): string {
  const venue = normalizeVenueKey(item.venueName);
  if (venue) return venue;
  if (rules?.length) {
    for (const rule of rules) {
      if (!ruleMatchesItem(rule, item)) continue;
      const needle = rule.venueContains?.trim();
      if (needle) return normalizeVenueKey(needle);
    }
  }
  return `id:${item.id}`;
}

/**
 * Walk an already-ordered list and keep at most `maxPerVenue` cards per
 * venue key for demoted venues. Uncapped items always pass.
 * Fills up to `limit` by continuing past skipped over-cap cards.
 *
 * `priorTaken` seeds venue counts (e.g. live cards already selected before
 * filling from an earlier pool).
 */
export function takeWithVenueCaps<T extends DemotionMatchable>(
  ordered: T[],
  limit: number,
  rules: FeedDemotionRule[] | undefined | null,
  priorTaken: DemotionMatchable[] = [],
): T[] {
  if (limit <= 0) return [];
  if (!rules?.length) return ordered.slice(0, limit);

  const counts = new Map<string, number>();
  for (const item of priorTaken) {
    const { maxPerVenue } = resolveDemotion(item, rules);
    if (maxPerVenue == null) continue;
    const key = venueCapKey(item, rules);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out: T[] = [];
  for (const item of ordered) {
    if (out.length >= limit) break;
    const { maxPerVenue } = resolveDemotion(item, rules);
    if (maxPerVenue == null) {
      out.push(item);
      continue;
    }
    const key = venueCapKey(item, rules);
    const n = counts.get(key) ?? 0;
    if (n >= maxPerVenue) continue;
    counts.set(key, n + 1);
    out.push(item);
  }

  return out;
}
