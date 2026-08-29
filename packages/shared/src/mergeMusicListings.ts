import { dayKey } from "./datetime";
import {
  normalizeOccurrenceLabel,
  normalizeVenueName,
} from "./eventOccurrences";
import { enrichCategoriesWithTags } from "./taxonomy";

/** Minimal fields needed to match and coalesce ticket-platform ↔ 19hz listings. */
export type MusicListingLike = {
  id: string;
  source: string;
  sourceEventId: string;
  url?: string | null;
  title?: string | null;
  venueName?: string | null;
  startsAt?: Date | string | null;
  timezone?: string | null;
  tags?: string[] | null;
  categories?: string[] | null;
  rawPayload?: unknown;
};

/**
 * Ticket platforms that 19hz often deep-links to. When a twin exists we prefer
 * the platform row (flyer/copy) and enrich genre tags from 19hz.
 */
export const MUSIC_TICKET_PLATFORMS = ["ra", "eventbrite", "dice"] as const;
export type MusicTicketPlatform = (typeof MUSIC_TICKET_PLATFORMS)[number];

/**
 * Sources preferred over 19hz when soft-matching (title/venue/day) without a
 * shared ticket URL — e.g. 19hz → luma.com while RA lists the same night.
 */
export const MUSIC_PREFERRED_OVER_19HZ = [
  "ra",
  "eventbrite",
  "dice",
  "ticketmaster",
  "luma",
] as const;

const PLATFORM_SET = new Set<string>(MUSIC_TICKET_PLATFORMS);
const PREFERRED_OVER_19HZ = new Set<string>(MUSIC_PREFERRED_OVER_19HZ);

/** Generic venues — never soft-match on these alone. */
const GENERIC_VENUE = new Set([
  "tba",
  "tbd",
  "various",
  "various venues",
  "online",
  "zoom",
  "secret",
  "secret location",
  "location tba",
  "venue tba",
]);

/** True when venue is missing or a non-identity placeholder (TBA/TBD/…). */
export function isGenericVenueName(
  venue: string | null | undefined,
): boolean {
  const na = normalizeVenueName(venue);
  return !na || GENERIC_VENUE.has(na);
}

const TITLE_STOP = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "w",
  "vs",
  "ft",
  "feat",
  "featuring",
  "presented",
  "presents",
  "tickets",
  "ticket",
  "free",
  "rsvp",
  "live",
  "dj",
  "set",
  "night",
  "party",
  "event",
  "show",
]);

export function isMusicTicketPlatform(
  source: string,
): source is MusicTicketPlatform {
  return PLATFORM_SET.has(source);
}

export function isMusicPreferredOver19hz(source: string): boolean {
  return PREFERRED_OVER_19HZ.has(source);
}

/**
 * Pull a Resident Advisor event id from a listing URL.
 * 19hz often links directly to `https://ra.co/events/{id}`.
 */
export function extractRaEventId(url: string | null | undefined): string | null {
  if (!url) return null;
  const fromPath = url.match(/(?:^|\/\/)(?:www\.)?ra\.co\/events\/(\d+)/i);
  if (fromPath?.[1]) return fromPath[1];
  try {
    const u = new URL(url);
    if (!/(^|\.)ra\.co$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/events\/(\d+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Eventbrite numeric event id from `/e/...-tickets-{id}` (and close variants).
 * Organizer subdomains without an `/e/` path return null.
 */
export function extractEventbriteEventId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)eventbrite\.com$/i.test(u.hostname)) return null;
    const tickets = u.pathname.match(/\/e\/[^/?#]*?-tickets-(\d+)/i);
    if (tickets?.[1]) return tickets[1];
    const trailing = u.pathname.match(/\/e\/[^/?#]*?-(\d{10,})\/?$/i);
    if (trailing?.[1]) return trailing[1];
    return null;
  } catch {
    const tickets = url.match(/eventbrite\.com\/e\/[^/?#]*?-tickets-(\d+)/i);
    if (tickets?.[1]) return tickets[1];
    const trailing = url.match(/eventbrite\.com\/e\/[^/?#]*?-(\d{10,})(?:\/|$|\?)/i);
    return trailing?.[1] ?? null;
  }
}

/**
 * Dice event slug from `/event/{id}-…` or `/partner/tickets/event/{id}-…`.
 */
export function extractDiceEventId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)dice\.fm$/i.test(u.hostname)) return null;
    const m = u.pathname.match(
      /(?:\/partner\/tickets)?\/event\/([a-z0-9]+)(?:-|$|\?)/i,
    );
    return m?.[1]?.toLowerCase() ?? null;
  } catch {
    const m = url.match(
      /dice\.fm(?:\/partner\/tickets)?\/event\/([a-z0-9]+)(?:-|$|\?)/i,
    );
    return m?.[1]?.toLowerCase() ?? null;
  }
}

/** Platform + id when a URL clearly belongs to RA / Eventbrite / Dice. */
export function extractMusicPlatformRef(
  url: string | null | undefined,
): { platform: MusicTicketPlatform; id: string } | null {
  const ra = extractRaEventId(url);
  if (ra) return { platform: "ra", id: ra };
  const eb = extractEventbriteEventId(url);
  if (eb) return { platform: "eventbrite", id: eb };
  const dice = extractDiceEventId(url);
  if (dice) return { platform: "dice", id: dice };
  return null;
}

/** Stable key for exact-URL matching across sources. */
export function normalizeListingUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * URL identity that ignores http/https and leading www — used when matching
 * 19hz ticket links to platform rows.
 */
export function listingIdentityUrl(
  url: string | null | undefined,
): string | null {
  const norm = normalizeListingUrl(url);
  if (!norm) return null;
  try {
    const u = new URL(norm);
    const host = u.hostname.replace(/^www\./i, "");
    return `https://${host}${u.pathname}`.toLowerCase();
  } catch {
    return norm.replace(/^https?:\/\//i, "https://").replace(
      /\/\/www\./i,
      "//",
    );
  }
}

function tagKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Union tags with 19hz genres first (richer chips), then platform genres.
 */
export function mergeMusicTags(
  platformTags: string[] | null | undefined,
  nineteenHzTags: string[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(nineteenHzTags ?? []), ...(platformTags ?? [])]) {
    const key = tagKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

/** Prefer platform flyer/copy; pull genre tags from the 19hz twin. */
export function mergePlatformWithNineteenHz<T extends MusicListingLike>(
  platform: T,
  nineteenHz: T,
): T {
  const tags = mergeMusicTags(platform.tags, nineteenHz.tags);
  const categories = enrichCategoriesWithTags(
    [...(platform.categories ?? [])],
    tags,
  );
  const payload =
    (platform.rawPayload as Record<string, unknown> | null | undefined) ?? {};
  return {
    ...platform,
    tags,
    categories,
    rawPayload: {
      ...payload,
      mergedFrom19hzId: nineteenHz.id,
      mergedFrom19hzTags: nineteenHz.tags ?? [],
    },
  };
}

/** @deprecated Prefer mergePlatformWithNineteenHz */
export const mergeRaWithNineteenHz = mergePlatformWithNineteenHz;

function listingMatchKeys(event: MusicListingLike): string[] {
  const keys: string[] = [];
  if (isMusicTicketPlatform(event.source) && event.sourceEventId) {
    keys.push(`${event.source}:${event.sourceEventId}`);
  }
  const ref = extractMusicPlatformRef(event.url);
  if (ref) keys.push(`${ref.platform}:${ref.id}`);
  const identity = listingIdentityUrl(event.url);
  if (identity) keys.push(`url:${identity}`);
  return keys;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function titleSignificantTokens(title: string): string[] {
  return normalizeOccurrenceLabel(title)
    .split(" ")
    .filter((t) => t.length >= 2 && !TITLE_STOP.has(t));
}

/**
 * Soft title match: containment, token-subset, or Jaccard ≥ 0.4.
 * "groove" ↔ "Groove: GOMA, Teego, Ancarco"; rejects unrelated same-venue nights.
 */
export function musicTitlesSoftMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeOccurrenceLabel(a ?? "");
  const nb = normalizeOccurrenceLabel(b ?? "");
  if (!na || !nb) return false;

  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;

  const ta = titleSignificantTokens(a ?? "");
  const tb = titleSignificantTokens(b ?? "");
  if (!ta.length || !tb.length) return false;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap++;

  const shorter = setA.size <= setB.size ? setA : setB;
  const longer = setA.size <= setB.size ? setB : setA;
  if (
    shorter.size >= 1 &&
    [...shorter].every((t) => longer.has(t)) &&
    [...shorter].some((t) => t.length >= 4)
  ) {
    return true;
  }

  const union = new Set([...setA, ...setB]).size;
  return union > 0 && overlap / union >= 0.4;
}

export function musicVenuesSoftMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeVenueName(a);
  const nb = normalizeVenueName(b);
  if (!na || !nb) return false;
  if (isGenericVenueName(a) || isGenericVenueName(b)) return false;
  if (na === nb) return true;
  if (na.length >= 5 && nb.includes(na)) return true;
  if (nb.length >= 5 && na.includes(nb)) return true;
  return false;
}

function sameMusicNight(
  a: MusicListingLike,
  b: MusicListingLike,
): boolean {
  const da = toDate(a.startsAt);
  const db = toDate(b.startsAt);
  if (!da || !db) return false;
  const tzA = a.timezone || "America/Los_Angeles";
  const tzB = b.timezone || "America/Los_Angeles";
  if (dayKey(da, tzA) === dayKey(db, tzB)) {
    return Math.abs(da.getTime() - db.getTime()) <= 4 * 60 * 60 * 1000;
  }
  return Math.abs(da.getTime() - db.getTime()) <= 2 * 60 * 60 * 1000;
}

/** Artists from RA/etc payload — boost title soft-match when present in twin title. */
function payloadArtistTokens(rawPayload: unknown): string[] {
  if (!rawPayload || typeof rawPayload !== "object") return [];
  const artists = (rawPayload as { artists?: unknown }).artists;
  if (!Array.isArray(artists)) return [];
  const out: string[] = [];
  for (const a of artists) {
    if (typeof a !== "string" || !a.trim()) continue;
    out.push(...titleSignificantTokens(a));
  }
  return out;
}

function artistOverlapBoost(
  platform: MusicListingLike,
  nineteenHz: MusicListingLike,
): boolean {
  const artists = payloadArtistTokens(platform.rawPayload);
  if (!artists.length) return false;
  const hzTitle = normalizeOccurrenceLabel(nineteenHz.title ?? "");
  if (!hzTitle) return false;
  const hits = artists.filter((a) => a.length >= 3 && hzTitle.includes(a));
  return hits.length >= 1;
}

/**
 * Soft twin: same night + venue + (title soft-match OR shared artist in title).
 * Catches 19hz→Luma ticket URLs that never share an RA event id.
 */
export function musicListingsSoftMatch(
  preferred: MusicListingLike,
  nineteenHz: MusicListingLike,
): boolean {
  if (!sameMusicNight(preferred, nineteenHz)) return false;
  if (!musicVenuesSoftMatch(preferred.venueName, nineteenHz.venueName)) {
    return false;
  }
  if (musicTitlesSoftMatch(preferred.title, nineteenHz.title)) return true;
  return artistOverlapBoost(preferred, nineteenHz);
}

function softMatchScore(
  preferred: MusicListingLike,
  nineteenHz: MusicListingLike,
): number {
  let score = 0;
  const pt = normalizeOccurrenceLabel(preferred.title ?? "");
  const ht = normalizeOccurrenceLabel(nineteenHz.title ?? "");
  if (pt && ht) {
    if (pt === ht) score += 5;
    else if (ht.includes(pt) || pt.includes(ht)) score += 3;
    else score += 1;
  }
  if (artistOverlapBoost(preferred, nineteenHz)) score += 2;
  const da = toDate(preferred.startsAt);
  const db = toDate(nineteenHz.startsAt);
  if (da && db) {
    const diffH = Math.abs(da.getTime() - db.getTime()) / 3_600_000;
    score += Math.max(0, 2 - diffH);
  }
  return score;
}

/**
 * Prefer RA / Eventbrite / Dice as the canonical listing when a 19hz row
 * points at the same ticket event (shared platform URL or id). Also soft-match
 * when ticket URLs diverge (e.g. 19hz → luma.com, RA → ra.co) via title +
 * venue + start time. Keep platform lineup / flyer / copy; enrich tags from 19hz.
 *
 * Unmatched 19hz rows are kept. Non music-source rows pass through.
 */
export function coalesceMusicPlatformNineteenHz<T extends MusicListingLike>(
  rows: T[],
): T[] {
  const platformByKey = new Map<string, T>();
  for (const row of rows) {
    if (!isMusicTicketPlatform(row.source)) continue;
    for (const key of listingMatchKeys(row)) {
      if (!platformByKey.has(key)) platformByKey.set(key, row);
    }
  }

  const suppressed19hz = new Set<string>();
  const enrichments = new Map<string, T[]>(); // preferred.id → 19hz rows

  function attachTwin(preferred: T, hz: T) {
    if (suppressed19hz.has(hz.id)) return;
    suppressed19hz.add(hz.id);
    const list = enrichments.get(preferred.id) ?? [];
    list.push(hz);
    enrichments.set(preferred.id, list);
  }

  // Pass 1 — hard URL / platform-id twins
  for (const row of rows) {
    if (row.source !== "19hz") continue;
    let matched: T | undefined;
    for (const key of listingMatchKeys(row)) {
      matched = platformByKey.get(key);
      if (matched) break;
    }
    if (!matched) continue;
    attachTwin(matched, row);
  }

  // Pass 2 — soft title/venue/day when ticket URLs differ (Luma, etc.)
  const preferredRows = rows.filter((r) => isMusicPreferredOver19hz(r.source));
  const unmatched19hz = rows.filter(
    (r) => r.source === "19hz" && !suppressed19hz.has(r.id),
  );

  for (const hz of unmatched19hz) {
    let best: T | null = null;
    let bestScore = -1;
    for (const pref of preferredRows) {
      if (!musicListingsSoftMatch(pref, hz)) continue;
      const score = softMatchScore(pref, hz);
      if (score > bestScore) {
        bestScore = score;
        best = pref;
      }
    }
    if (best) attachTwin(best, hz);
  }

  if (!suppressed19hz.size) return rows;

  const out: T[] = [];
  const emittedPreferred = new Set<string>();

  for (const row of rows) {
    if (row.source === "19hz" && suppressed19hz.has(row.id)) continue;

    if (enrichments.has(row.id)) {
      if (emittedPreferred.has(row.id)) continue;
      emittedPreferred.add(row.id);
      const twins = enrichments.get(row.id)!;
      out.push(
        twins.reduce((acc, hz) => mergePlatformWithNineteenHz(acc, hz), row),
      );
      continue;
    }

    out.push(row);
  }

  return out;
}

/** @deprecated Prefer coalesceMusicPlatformNineteenHz */
export const coalesceRaNineteenHz = coalesceMusicPlatformNineteenHz;
