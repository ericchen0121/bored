import { createHash } from "node:crypto";
import type { RegistrationStatus } from "@bored/shared";

export type NormalizedEvent = {
  source: string;
  sourceEventId: string;
  /** Defaults from source/categories in upsert when omitted. */
  kind?: "event" | "recommendation";
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  timezone?: string;
  venueName?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
  city?: string;
  priceMin?: number | null;
  priceMax?: number | null;
  isFree?: boolean;
  categories?: string[];
  tags?: string[];
  ageRestriction?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  organizer?: string | null;
  recurringShowId?: string | null;
  registrationStatus?: RegistrationStatus | null;
  registrationCheckedAt?: Date | null;
  rawPayload?: unknown;
};

export type NormalizedShowtimeBatch = {
  /** Ingest provenance stored on showtimes.source (tms, indie_theater, …) */
  source?: string;
  film: {
    title: string;
    year?: number | null;
    runtimeMinutes?: number | null;
    mpaa?: string | null;
    synopsis?: string | null;
    tmdbId?: number | null;
    imdbId?: string | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    trailerYoutubeId?: string | null;
    genres?: string[];
    ratings?: {
      imdb?: number | null;
      rtCritics?: number | null;
      rtAudience?: number | null;
      metacritic?: number | null;
      letterboxd?: number | null;
    };
    letterboxdUrl?: string | null;
    rtUrl?: string | null;
    rtConsensus?: string | null;
    reviews?: {
      source: "letterboxd" | "rotten_tomatoes" | "tmdb";
      author?: string | null;
      content: string;
      url?: string | null;
      rating?: number | null;
    }[];
  };
  theater: {
    name: string;
    chain?: string | null;
    address?: string | null;
    neighborhood?: string | null;
    lat?: number | null;
    lng?: number | null;
    sourceTheatreId: string;
  };
  showtimes: {
    startsAt: Date;
    format?: string | null;
    ticketUrl?: string | null;
    sourceShowtimeId: string;
  }[];
};

export interface SourceAdapter {
  id: string;
  description: string;
  fetch(): Promise<AdapterFetchResult>;
}

/** Result of a single adapter fetch. */
export type AdapterFetchResult = {
  events?: NormalizedEvent[];
  showtimes?: NormalizedShowtimeBatch[];
  /**
   * Closed-set replace: after upsert, delete other `events` rows for this
   * source whose sourceEventId is not in the upserted set (curated / durable).
   */
  replaceForSource?: string;
  /**
   * Explicit ids to delete after upsert (coalesce orphans, capped run days).
   * Grouped by `events.source`.
   */
  deleteSourceEventIds?: { source: string; ids: string[] }[];
  /**
   * Drop legacy `${source}:<32-hex>` coalesce rewrite ids for these sources.
   */
  purgeLegacyCoalesceSources?: string[];
};

export function contentHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

/**
 * Fingerprint of mutable listing fields for change detection.
 * Identity stays on `(source, sourceEventId)` — do not use this as a key.
 */
export function eventContentHash(ev: NormalizedEvent): string {
  return contentHash([
    ev.title,
    ev.startsAt.toISOString(),
    ev.endsAt?.toISOString() ?? "",
    ev.venueName ?? "",
    ev.address ?? "",
    ev.neighborhood ?? "",
    ev.city ?? "",
    String(ev.lat ?? ""),
    String(ev.lng ?? ""),
    String(ev.priceMin ?? ""),
    String(ev.priceMax ?? ""),
    String(ev.isFree ?? false),
    (ev.categories ?? []).slice().sort().join(","),
    (ev.tags ?? []).slice().sort().join(","),
    ev.ageRestriction ?? "",
    ev.url ?? "",
    ev.imageUrl ?? "",
    ev.organizer ?? "",
    ev.registrationStatus ?? "",
  ]);
}

export function parsePrice(text: string | null | undefined): {
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean;
} {
  if (!text) return { priceMin: null, priceMax: null, isFree: false };
  const lower = text.toLowerCase();
  if (/\bfree\b|no cover|\$0/.test(lower)) {
    return { priceMin: 0, priceMax: 0, isFree: true };
  }
  const nums = [...text.matchAll(/\$?\s*(\d+(?:\.\d+)?)/g)].map((m) =>
    Math.round(Number(m[1])),
  );
  if (!nums.length) return { priceMin: null, priceMax: null, isFree: false };
  return {
    priceMin: Math.min(...nums),
    priceMax: Math.max(...nums),
    isFree: Math.min(...nums) === 0,
  };
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "BoredSFBot/0.1 (+https://github.com/bored)",
      Accept: "text/html,application/json,application/rss+xml,*/*",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init);
  return JSON.parse(text) as T;
}
