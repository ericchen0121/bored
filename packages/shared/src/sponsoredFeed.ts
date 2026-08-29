import type { FeedCard } from "./schemas";

/** Default: 1 sponsored card per this many feed slots. */
export const SPONSORED_FEED_INTERVAL = 8;

/** Cap sponsored share of the final feed (~12%). */
export const SPONSORED_FEED_MAX_SHARE = 0.12;

/**
 * 0-based index of the first sponsored slot.
 * Tonight / by-time often use 0; For you uses 3 so organic leads.
 */
export const SPONSORED_FEED_FIRST_INDEX_DEFAULT = 3;

export type SponsoredActiveFields = {
  isSponsored?: boolean | null;
  sponsorEndsAt?: Date | string | null;
};

export function isSponsoredActive(
  row: SponsoredActiveFields,
  now: Date = new Date(),
): boolean {
  if (!row.isSponsored) return false;
  if (row.sponsorEndsAt == null) return true;
  const end =
    row.sponsorEndsAt instanceof Date
      ? row.sponsorEndsAt
      : new Date(row.sponsorEndsAt);
  if (Number.isNaN(end.getTime())) return true;
  return end.getTime() > now.getTime();
}

export type InjectSponsoredOptions = {
  /** Cards between sponsored placements (default 8). */
  interval?: number;
  /** Max sponsored / total (default 0.12). */
  maxShare?: number;
  /** 0-based first insert index (default 3). */
  firstIndex?: number;
};

/**
 * Place labeled sponsored cards into an already-ranked organic feed.
 *
 * - Dedupes by id (organic copies of the same event are removed first).
 * - Caps frequency (interval) and share (maxShare).
 * - Skips injection when the organic list is thinner than `firstIndex + 1`
 *   so niche topic filters are not dominated — still flips `isSponsored` on
 *   any organic card that is in the sponsored candidate set.
 */
export function injectSponsoredIntoFeed(
  organic: FeedCard[],
  sponsoredCandidates: FeedCard[],
  opts: InjectSponsoredOptions = {},
): FeedCard[] {
  const interval = opts.interval ?? SPONSORED_FEED_INTERVAL;
  const maxShare = opts.maxShare ?? SPONSORED_FEED_MAX_SHARE;
  const firstIndex = opts.firstIndex ?? SPONSORED_FEED_FIRST_INDEX_DEFAULT;

  // No-op identity when nothing is sponsored — keep map simple for TS.
  if (!sponsoredCandidates.length) return organic;

  const sponsoredById = new Map(
    sponsoredCandidates.map((s) => [s.id, { ...s, isSponsored: true }]),
  );

  // Thin niche feed: label only, do not inject extra slots.
  if (organic.length < firstIndex + 1) {
    return organic.map((c) =>
      sponsoredById.has(c.id) ? { ...c, isSponsored: true } : c,
    );
  }

  const base = organic.filter((c) => !sponsoredById.has(c.id));
  const queue = [...sponsoredById.values()].sort((a, b) => {
    const bw = (b.boostWeight ?? 1) - (a.boostWeight ?? 1);
    if (bw !== 0) return bw;
    return b.score - a.score;
  });

  const capacityByShare = Math.max(
    1,
    Math.floor((base.length + queue.length) * maxShare),
  );
  const capacityByInterval = Math.floor(base.length / Math.max(interval, 1)) + 1;
  const maxInject = Math.min(queue.length, capacityByShare, capacityByInterval);

  const result = [...base];
  let nextSlot = Math.min(Math.max(0, firstIndex), result.length);
  let injected = 0;

  for (const card of queue) {
    if (injected >= maxInject) break;
    const at = Math.min(nextSlot, result.length);
    result.splice(at, 0, card);
    injected += 1;
    nextSlot = at + interval + 1;
  }

  return result;
}
