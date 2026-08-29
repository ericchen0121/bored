import * as cheerio from "cheerio";
import {
  extractEventbriteEventId,
  extractRaEventId,
  normalizeListingUrl,
} from "@bored/shared";
import { fetchRaFlyerUrl } from "./adapters/ra.js";
import { fetchText } from "./types.js";

export { extractEventbriteEventId };

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Hosts that rarely expose a usable flyer via plain HTML fetch. */
const SKIP_OG_HOST =
  /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|fb\.me|ticketmaster\.com|ticketweb\.com|axs\.com|evyy\.net|tixr\.com|eventim\.(?:us|com)|wl\.eventim\.us)$/i;

/**
 * Unwrap affiliate / tracking wrappers (e.g. Ticketmaster Impact links).
 */
export function unwrapTicketUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const nested =
      u.searchParams.get("u") ||
      u.searchParams.get("url") ||
      u.searchParams.get("redirect") ||
      u.searchParams.get("dest");
    if (nested && /^https?:\/\//i.test(nested)) return nested;
  } catch {
    /* keep raw */
  }
  const m = url.match(/[?&]u=(https?[^&]+)/i);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return url.trim();
}

/** Ticketmaster / Ticketweb event id embedded in a ticket URL. */
export function extractTicketmasterEventId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const target = unwrapTicketUrl(url);
  const patterns = [
    /ticketmaster\.com\/event\/([A-Za-z0-9]+)/i,
    /ticketmaster\.com\/[^?\s]+\/event\/([A-Za-z0-9]+)/i,
    /ticketweb\.com\/event\/(?:id\/)?(\d+)/i,
    /ticketweb\.com\/event\/[^?\s]*?\/(\d+)(?:\?|$)/i,
  ];
  for (const re of patterns) {
    const m = target.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/**
 * Best-effort og:image (or twitter:image) from a public ticket/event page.
 */
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  const target = unwrapTicketUrl(pageUrl);
  const host = hostOf(target);
  if (!host || SKIP_OG_HOST.test(host)) return null;

  let html: string;
  try {
    html = await fetchText(target, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return null;
  }

  const $ = cheerio.load(html);
  const raw =
    $('meta[property="og:image"]').attr("content")?.trim() ||
    $('meta[property="og:image:url"]').attr("content")?.trim() ||
    $('meta[property="og:image:secure_url"]').attr("content")?.trim() ||
    $('meta[name="twitter:image"]').attr("content")?.trim() ||
    $('meta[name="twitter:image:src"]').attr("content")?.trim() ||
    null;
  if (!raw || raw.startsWith("data:")) return null;

  return normalizeFetchedImageUrl(raw, target);
}

/** Resolve relative URLs and unwrap Next.js `/_next/image?url=` proxies. */
export function normalizeFetchedImageUrl(
  raw: string,
  pageUrl: string,
): string | null {
  try {
    const u = new URL(raw, pageUrl);
    const nested = u.searchParams.get("url");
    if (u.pathname.includes("/_next/image") && nested) {
      try {
        return new URL(nested).toString();
      } catch {
        try {
          return decodeURIComponent(nested);
        } catch {
          return nested;
        }
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Resolve a flyer/image for a 19hz (or similar) outbound ticket URL.
 * Prefers first-party APIs where HTML is blocked (RA GraphQL).
 */
export async function resolveTicketPageImage(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url?.trim()) return null;
  const target = unwrapTicketUrl(url);

  const raId = extractRaEventId(target);
  if (raId) {
    try {
      const flyer = await fetchRaFlyerUrl(raId);
      if (flyer) return flyer;
    } catch {
      /* fall through */
    }
  }

  return fetchOgImage(target);
}

/** Keys useful for matching an outbound ticket URL to an existing imaged row. */
export function ticketImageMatchKeys(url: string | null | undefined): string[] {
  if (!url?.trim()) return [];
  const target = unwrapTicketUrl(url);
  const keys: string[] = [];

  const raId = extractRaEventId(target);
  if (raId) keys.push(`ra:${raId}`);

  const tmId = extractTicketmasterEventId(target);
  if (tmId) keys.push(`tm:${tmId}`);

  const ebId = extractEventbriteEventId(target);
  if (ebId) keys.push(`eb:${ebId}`);

  const norm = normalizeListingUrl(target);
  if (norm) keys.push(`url:${norm}`);

  return keys;
}

export async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++]!;
      await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}
