/** Rank Instagram reels + YouTube Shorts for the homepage carousel. */

import { formatEventPriceLabel } from "./budget";
import type { Rankable } from "./ranker";
import type { FeedCard } from "./schemas";
import { FEED_VIDEO_CAROUSEL_LIMIT } from "./videoFeed";

/** Soft-hide covers the user scrolled past / left on screen. */
export const VIDEO_IMPRESS_TTL_MS = 7 * 86400000;
/** Stronger hide after opening the reel player. */
export const VIDEO_OPENED_TTL_MS = 21 * 86400000;
/** Drop recommendation tips older than this publish age (when dated). */
export const VIDEO_TIP_MAX_AGE_MS = 30 * 86400000;
/** Prefer at least this many tiles before relaxing impress/opened hides. */
export const VIDEO_CAROUSEL_MIN_FILL = 12;
/** Max tiles from one IG handle / YT channel in one carousel. */
export const VIDEO_CREATOR_CAP = 2;

/** Today shared cache stores a larger pool; overlay personalizes down to limit. */
export const FEED_VIDEO_CACHE_POOL_LIMIT = FEED_VIDEO_CAROUSEL_LIMIT * 2;

export type VideoCarouselRankOpts = {
  now?: Date;
  impressedIds?: Set<string>;
  openedIds?: Set<string>;
  dismissedIds?: Set<string>;
  limit?: number;
  minFill?: number;
  creatorCap?: number;
  tipMaxAgeMs?: number;
};

function creatorKey(item: {
  source?: string | null;
  tags?: string[] | null;
  organizer?: string | null;
  recommendationLabel?: string | null;
  rawPayload?: unknown;
}): string {
  const payload =
    item.rawPayload && typeof item.rawPayload === "object"
      ? (item.rawPayload as { handle?: unknown; channelTitle?: unknown })
      : null;
  if (typeof payload?.handle === "string" && payload.handle.trim()) {
    return `ig:${payload.handle.trim().toLowerCase().replace(/^@/, "")}`;
  }
  if (typeof payload?.channelTitle === "string" && payload.channelTitle.trim()) {
    return `yt:${payload.channelTitle.trim().toLowerCase()}`;
  }
  const tags = item.tags ?? [];
  for (const t of tags) {
    const s = t.trim();
    if (!s || s === "instagram" || s === "reel" || s === "video" || s === "short" || s === "shorts" || s === "city_guide" || s === "new_opening") {
      continue;
    }
    // IG adapter tags the handle without @.
    if (/^[A-Za-z0-9._]{2,30}$/.test(s) && item.source === "instagram") {
      return `ig:${s.toLowerCase()}`;
    }
  }
  if (item.source === "youtube") return "yt:unknown";
  if (item.source === "instagram") return "ig:unknown";
  return `src:${item.source ?? "unknown"}`;
}

function publishTime(item: { publishedAt?: Date | string | null; startsAt?: Date | string | null }): number {
  if (item.publishedAt) {
    const t = new Date(item.publishedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (item.startsAt) {
    const t = new Date(item.startsAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function isTipKind(item: { kind?: string | null; recommendationLabel?: string | null }): boolean {
  return item.kind === "recommendation" || Boolean(item.recommendationLabel);
}

function tooOldTip(
  item: {
    kind?: string | null;
    recommendationLabel?: string | null;
    publishedAt?: Date | string | null;
  },
  now: Date,
  tipMaxAgeMs: number,
): boolean {
  if (!isTipKind(item) || !item.publishedAt) return false;
  const t = new Date(item.publishedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t > tipMaxAgeMs;
}

function toVideoCard(s: Rankable & { score: number }): FeedCard {
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
    bucket: "serendipity",
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

function takeWithCreatorCap<T extends { id: string; source?: string | null; tags?: string[] | null; recommendationLabel?: string | null; rawPayload?: unknown }>(
  items: T[],
  limit: number,
  creatorCap: number,
): T[] {
  const out: T[] = [];
  const counts = new Map<string, number>();
  const deferred: T[] = [];

  for (const item of items) {
    if (out.length >= limit) break;
    const key = creatorKey(item);
    const n = counts.get(key) ?? 0;
    if (n >= creatorCap) {
      deferred.push(item);
      continue;
    }
    out.push(item);
    counts.set(key, n + 1);
  }

  for (const item of deferred) {
    if (out.length >= limit) break;
    out.push(item);
  }
  return out;
}

/**
 * Pick carousel videos: fresh publish first, hide recent impress/opened,
 * creator diversity, then fill from relaxed hides if thin.
 */
export function rankVideoCarousel(
  items: Rankable[],
  opts: VideoCarouselRankOpts = {},
): FeedCard[] {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? FEED_VIDEO_CAROUSEL_LIMIT;
  const minFill = opts.minFill ?? VIDEO_CAROUSEL_MIN_FILL;
  const creatorCap = opts.creatorCap ?? VIDEO_CREATOR_CAP;
  const tipMaxAgeMs = opts.tipMaxAgeMs ?? VIDEO_TIP_MAX_AGE_MS;
  const dismissed = opts.dismissedIds ?? new Set<string>();
  const impressed = opts.impressedIds ?? new Set<string>();
  const opened = opts.openedIds ?? new Set<string>();

  const fresh: Rankable[] = [];
  const impressedPool: Rankable[] = [];
  const openedPool: Rankable[] = [];

  for (const item of items) {
    if (dismissed.has(item.id)) continue;
    if (tooOldTip(item, now, tipMaxAgeMs)) continue;

    if (opened.has(item.id)) {
      openedPool.push(item);
      continue;
    }
    if (impressed.has(item.id)) {
      impressedPool.push(item);
      continue;
    }
    fresh.push(item);
  }

  const byPublishDesc = (a: Rankable, b: Rankable) =>
    publishTime(b) - publishTime(a);

  fresh.sort(byPublishDesc);
  impressedPool.sort(byPublishDesc);
  openedPool.sort(byPublishDesc);

  const scored = (item: Rankable, idx: number): Rankable & { score: number } => ({
    ...item,
    // Newer publish → higher score; stable within same second via idx.
    score: publishTime(item) / 1e13 + (1 - idx / 1e6),
  });

  let ordered = fresh.map(scored);
  if (ordered.length < minFill) {
    ordered = [
      ...ordered,
      ...impressedPool.map((item, i) => scored(item, ordered.length + i)),
    ];
  }
  if (ordered.length < minFill) {
    ordered = [
      ...ordered,
      ...openedPool.map((item, i) => scored(item, ordered.length + i)),
    ];
  }

  return takeWithCreatorCap(ordered, limit, creatorCap).map(toVideoCard);
}

/**
 * Re-personalize an already-ranked video pool (Today cache overlay).
 * Same TTL / creator / min-fill rules as {@link rankVideoCarousel}.
 */
export function personalizeVideoCarouselCards<T extends FeedCard>(
  cards: T[],
  opts: VideoCarouselRankOpts = {},
): T[] {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? FEED_VIDEO_CAROUSEL_LIMIT;
  const minFill = opts.minFill ?? VIDEO_CAROUSEL_MIN_FILL;
  const creatorCap = opts.creatorCap ?? VIDEO_CREATOR_CAP;
  const tipMaxAgeMs = opts.tipMaxAgeMs ?? VIDEO_TIP_MAX_AGE_MS;
  const dismissed = opts.dismissedIds ?? new Set<string>();
  const impressed = opts.impressedIds ?? new Set<string>();
  const opened = opts.openedIds ?? new Set<string>();

  const fresh: T[] = [];
  const impressedPool: T[] = [];
  const openedPool: T[] = [];

  for (const card of cards) {
    if (dismissed.has(card.id)) continue;
    if (tooOldTip(card, now, tipMaxAgeMs)) continue;
    if (opened.has(card.id)) {
      openedPool.push(card);
      continue;
    }
    if (impressed.has(card.id)) {
      impressedPool.push(card);
      continue;
    }
    fresh.push(card);
  }

  const byPublishDesc = (a: T, b: T) => publishTime(b) - publishTime(a);
  fresh.sort(byPublishDesc);
  impressedPool.sort(byPublishDesc);
  openedPool.sort(byPublishDesc);

  let ordered = [...fresh];
  if (ordered.length < minFill) ordered = [...ordered, ...impressedPool];
  if (ordered.length < minFill) ordered = [...ordered, ...openedPool];

  return takeWithCreatorCap(ordered, limit, creatorCap);
}
