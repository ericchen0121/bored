import { db, events as eventsTable } from "@bored/db";
import {
  extractRaEventId,
  normalizeListingUrl,
} from "@bored/shared";
import { and, gte, isNotNull, ne, sql } from "drizzle-orm";
import {
  BrowserOgScraper,
  browserImageScrapeCap,
  browserImageScrapeConcurrency,
  browserImageScrapeEnabled,
  isBrowserImageHost,
} from "./browserOgImage.js";
import {
  extractEventbriteEventId,
  extractTicketmasterEventId,
  mapPool,
  resolveTicketPageImage,
  ticketImageMatchKeys,
  unwrapTicketUrl,
} from "./ticketPageImage.js";

export type TicketImageTarget = {
  url?: string | null;
  imageUrl?: string | null;
};

export type TicketImageEnrichStats = {
  twins: number;
  plain: number;
  browser: number;
  attemptedBrowser: number;
  browserSkipped: boolean;
};

/**
 * Fill missing `imageUrl` on calendar rows that only have outbound ticket links
 * (19hz today; reuse for any future text-table city calendar).
 *
 * Order: DB twin → plain HTTP og:image / RA GraphQL → allowlisted Chromium og:image.
 */
export async function enrichEventsWithTicketImages(
  events: TicketImageTarget[],
  opts?: {
    /** Cap Chromium pages this pass (defaults to BROWSER_IMAGE_SCRAPE_CAP). */
    browserCap?: number;
    plainConcurrency?: number;
    plainCap?: number;
    /** When false, skip Playwright even if enabled in env. */
    useBrowser?: boolean;
  },
): Promise<TicketImageEnrichStats> {
  const stats: TicketImageEnrichStats = {
    twins: 0,
    plain: 0,
    browser: 0,
    attemptedBrowser: 0,
    browserSkipped: false,
  };

  const missing = events.filter((ev) => !ev.imageUrl && ev.url);
  if (!missing.length) return stats;

  const byKey = await loadImagedTwinIndex();
  for (const ev of missing) {
    const twin = imageFromTwinIndex(ev.url!, byKey);
    if (twin) {
      ev.imageUrl = twin;
      stats.twins++;
    }
  }

  const afterTwins = missing.filter((ev) => !ev.imageUrl);
  const plainCap = opts?.plainCap ?? 200;
  const toPlain = afterTwins.slice(0, plainCap);
  await mapPool(toPlain, opts?.plainConcurrency ?? 5, async (ev) => {
    try {
      const imageUrl = await resolveTicketPageImage(ev.url);
      if (imageUrl) {
        ev.imageUrl = imageUrl;
        stats.plain++;
      }
    } catch {
      /* best-effort */
    }
  });

  const useBrowser = opts?.useBrowser ?? true;
  if (!useBrowser || !browserImageScrapeEnabled()) {
    stats.browserSkipped = true;
    return stats;
  }

  const browserCap = opts?.browserCap ?? browserImageScrapeCap();
  const needBrowser = missing
    .filter((ev) => !ev.imageUrl && ev.url && isBrowserImageHost(ev.url))
    .slice(0, browserCap);
  if (!needBrowser.length) return stats;

  const scraper = await BrowserOgScraper.create();
  if (!scraper) {
    stats.browserSkipped = true;
    return stats;
  }

  stats.attemptedBrowser = needBrowser.length;
  try {
    await mapPool(
      needBrowser,
      browserImageScrapeConcurrency(),
      async (ev) => {
        try {
          const imageUrl = await scraper.scrape(ev.url!);
          if (imageUrl) {
            ev.imageUrl = imageUrl;
            stats.browser++;
          }
        } catch {
          /* best-effort */
        }
      },
    );
  } finally {
    await scraper.close();
  }

  return stats;
}

type TwinIndex = Map<string, string>;

async function loadImagedTwinIndex(): Promise<TwinIndex> {
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const rows = await db
    .select({
      source: eventsTable.source,
      sourceEventId: eventsTable.sourceEventId,
      url: eventsTable.url,
      imageUrl: eventsTable.imageUrl,
    })
    .from(eventsTable)
    .where(
      and(
        ne(eventsTable.source, "19hz"),
        isNotNull(eventsTable.imageUrl),
        sql`btrim(${eventsTable.imageUrl}) <> ''`,
        gte(eventsTable.startsAt, cutoff),
      ),
    )
    .limit(4000);

  const index: TwinIndex = new Map();
  for (const row of rows) {
    if (!row.imageUrl) continue;
    if (row.source === "ra" && row.sourceEventId) {
      index.set(`ra:${row.sourceEventId}`, row.imageUrl);
    }
    if (
      (row.source === "ticketmaster" || row.source === "comedy_venue") &&
      row.sourceEventId
    ) {
      index.set(`tm:${row.sourceEventId}`, row.imageUrl);
    }
    if (row.source === "eventbrite" && row.sourceEventId) {
      index.set(`eb:${row.sourceEventId}`, row.imageUrl);
    }
    if (row.url) {
      const target = unwrapTicketUrl(row.url);
      const norm = normalizeListingUrl(target);
      if (norm) index.set(`url:${norm}`, row.imageUrl);
      const tmId = extractTicketmasterEventId(target);
      if (tmId) index.set(`tm:${tmId}`, row.imageUrl);
      const ebId = extractEventbriteEventId(target);
      if (ebId) index.set(`eb:${ebId}`, row.imageUrl);
      const raId = extractRaEventId(target);
      if (raId) index.set(`ra:${raId}`, row.imageUrl);
    }
  }
  return index;
}

function imageFromTwinIndex(url: string, index: TwinIndex): string | null {
  for (const key of ticketImageMatchKeys(url)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}
