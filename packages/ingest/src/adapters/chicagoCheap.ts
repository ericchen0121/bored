import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { fromZonedTime } from "@bored/shared";
import {
  contentHash,
  fetchText,
  parsePrice,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const EVENTS_URL = "https://chicagoonthecheap.com/events/";
const TIMEZONE = "America/Chicago";

/**
 * Chicago on the Cheap — Funcheap-style free/cheap editorial calendar.
 * The /events/ page lists near-term outings by day (today through the weekend).
 * Post pages carry blurbs, photos, and structured sub-event boxes.
 */
export const chicagoCheapAdapter: SourceAdapter = {
  id: "chicago_cheap",
  description: "Chicago on the Cheap events calendar",
  async fetch() {
    const html = await fetchText(EVENTS_URL);
    const events = parseEventsCalendar(html);
    await backfillChicagoCheapDetails(events, 8);
    return { events };
  },
};

type DayParts = { year: number; month: number; day: number };

type ParsedListing = {
  title: string;
  url: string;
  timeText?: string;
  priceText?: string;
  venueName?: string;
};

export function parseEventsCalendar(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const events: NormalizedEvent[] = [];
  const seen = new Set<string>();

  $("h2.lotc-event").each((_, h2El) => {
    const day = parseDayHeader($(h2El).text());
    if (!day) return;

    let sib = $(h2El).next();
    while (sib.length && !sib.is("h2.lotc-event")) {
      if (sib.is("div.event")) {
        const table = sib.find("table.table-events").first();
        if (table.length) {
          for (const listing of parseTableBlock(table)) {
            pushListing(events, seen, day, listing);
          }
        } else {
          const listing = parseCardRow(sib);
          if (listing) pushListing(events, seen, day, listing);
        }
      }
      sib = sib.next();
    }
  });

  return events;
}

function pushListing(
  events: NormalizedEvent[],
  seen: Set<string>,
  day: DayParts,
  listing: ParsedListing,
) {
  const ev = listingToEvent(day, listing);
  if (!ev || seen.has(ev.sourceEventId)) return;
  seen.add(ev.sourceEventId);
  events.push(ev);
}

function parseCardRow(row: cheerio.Cheerio<Element>): ParsedListing | null {
  const link = row.find("h3 a").first();
  const title = decodeEntities(link.text().replace(/\s+/g, " ").trim());
  const url = link.attr("href")?.trim() ?? "";
  if (!title || !url) return null;

  const meta = decodeEntities(row.find("p.meta").text().replace(/\s+/g, " ").trim());
  const parsed = parseMetaLine(meta);
  return { title, url, ...parsed };
}

function parseTableBlock(table: cheerio.Cheerio<Element>): ParsedListing[] {
  const out: ParsedListing[] = [];
  table.find("tbody tr").each((_, tr) => {
    const cells = cheerio.load(tr)("td");
    if (!cells.length) return;

    const titleCell = cells.eq(0);
    const title = decodeEntities(
      (titleCell.find("a").text() || titleCell.text()).replace(/\s+/g, " ").trim(),
    );
    const url = titleCell.find("a").attr("href")?.trim() ?? "";
    if (!title || !url) return;

    out.push({
      title,
      url,
      timeText: cells.eq(1).text().replace(/\s+/g, " ").trim() || undefined,
      priceText: cells.eq(2).text().replace(/\s+/g, " ").trim() || undefined,
      venueName: cells.eq(3).text().replace(/\s+/g, " ").trim() || undefined,
    });
  });
  return out;
}

/** "Today: Tuesday, August 25, 2026" → { year, month, day } */
export function parseDayHeader(text: string): DayParts | null {
  const cleaned = text
    .replace(/^Today:\s*/i, "")
    .replace(/^Tomorrow:\s*/i, "")
    .replace(/^\w+day,\s*/i, "")
    .trim();

  const m = cleaned.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;

  const month = monthIndex(m[1]!);
  if (month == null) return null;

  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !year) return null;

  return { year, month: month + 1, day };
}

function listingToEvent(
  day: DayParts,
  listing: ParsedListing,
): NormalizedEvent | null {
  const timeText = listing.timeText?.trim() ?? "";
  const priceText = listing.priceText?.trim() ?? "";
  const venueName = listing.venueName?.trim() || null;

  const range = timeText ? parseTimeRange(timeText) : null;
  const startParts = range?.start ?? { hour: 12, minute: 0 };
  const startsAt = fromZonedTime(
    day.year,
    day.month,
    day.day,
    startParts.hour,
    startParts.minute,
    0,
    TIMEZONE,
  );

  if (startsAt.getTime() < Date.now() - 6 * 3600000) return null;

  const endsAt =
    range?.end != null
      ? fromZonedTime(
          day.year,
          day.month,
          day.day,
          range.end.hour,
          range.end.minute,
          0,
          TIMEZONE,
        )
      : null;

  const priceBlob = [listing.title, priceText].filter(Boolean).join(" ");
  const { priceMin, priceMax, isFree } = parsePrice(priceBlob);
  const free =
    isFree ||
    /\bfree\b/i.test(listing.title) ||
    /\bfree\b/i.test(priceText);

  const slug = listing.url.replace(/\/$/, "").split("/").pop() ?? listing.url;
  const dayKey = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
  const sourceEventId = contentHash([
    "chicago_cheap",
    slug,
    dayKey,
    timeText || "all-day",
  ]);

  return {
    source: "chicago_cheap",
    sourceEventId,
    title: listing.title,
    startsAt,
    endsAt,
    timezone: TIMEZONE,
    venueName,
    city: "chicago",
    priceMin: free ? 0 : priceMin,
    priceMax: free ? 0 : priceMax,
    isFree: free,
    categories: categoriesFromText(listing.title, priceBlob, venueName ?? ""),
    tags: ["chicago_cheap", "calendar"],
    url: listing.url,
    rawPayload: {
      dayKey,
      timeText: timeText || null,
      priceText: priceText || null,
      venueName,
      listingUrl: EVENTS_URL,
    },
  };
}

/** Card meta: "10:30 am to 1:30 pm | FREE | Daley Plaza" */
export function parseMetaLine(meta: string): Omit<ParsedListing, "title" | "url"> {
  if (!meta) return {};

  const parts = meta
    .split("|")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!parts.length) return {};

  let timeText: string | undefined;
  let priceText: string | undefined;
  let venueName: string | undefined;

  for (const part of parts) {
    if (!timeText && /\d{1,2}:\d{2}\s*[ap]\.?m\.?/i.test(part)) {
      timeText = part;
      continue;
    }
    if (
      !priceText &&
      (/^(free|discounted|\$)/i.test(part) || /\$\d/.test(part))
    ) {
      priceText = part;
      continue;
    }
    if (!venueName) venueName = part;
  }

  return { timeText, priceText, venueName };
}

type Clock = { hour: number; minute: number };

export function parseTimeRange(text: string): { start: Clock; end?: Clock } | null {
  const range = text.match(
    /^(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s*(?:to|-)\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?)$/i,
  );
  if (range) {
    const start = parseClock(range[1]!);
    const end = parseClock(range[2]!);
    if (start) return { start, end: end ?? undefined };
  }

  const single = parseClock(text);
  return single ? { start: single } : null;
}

function parseClock(raw: string): Clock | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]!.toLowerCase();

  if (meridiem === "p" && hour !== 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;

  return { hour, minute };
}

function monthIndex(name: string): number | null {
  const months: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sept: 8,
    sep: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };
  return months[name.toLowerCase()] ?? null;
}

function categoriesFromText(
  title: string,
  body: string,
  venue: string,
): string[] {
  const text = `${title} ${body} ${venue}`.toLowerCase();
  const cats = new Set<string>(["free"]);
  if (/comedy|standup|stand-up|improv/i.test(text)) cats.add("comedy.showcase");
  if (/concert|dj|live music|jazz|band|music/i.test(text)) cats.add("music.live");
  if (/art|gallery|museum|exhibit|cultural center/i.test(text)) cats.add("arts");
  if (/food|dinner|taste|market|taco|dumpling|happy hour|restaurant/i.test(text))
    cats.add("food");
  if (/family|kids|zoo/i.test(text)) cats.add("family");
  if (/outdoor|park|hike|bike|lakefront|pier|tour/i.test(text))
    cats.add("outdoors");
  if (/film|movie|cinema/i.test(text)) cats.add("movies");
  if (/nightlife|club|party|bar|fireworks/i.test(text)) cats.add("nightlife");
  if (/festival|fest\b/i.test(text)) cats.add("outdoors");
  return [...cats];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type ChicagoCheapSubEvent = {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  isFree: boolean;
};

export type ChicagoCheapEnrichment = {
  description: string | null;
  sourcePageUrl: string;
  venueName: string | null;
  address: string | null;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
  isFree: boolean | null;
};

/**
 * Lazy detail enrich — editorial blurb, hero image, structured venue/address.
 * Mirrors Funcheap: cached in DB after first open or ingest backfill.
 */
export async function enrichChicagoCheapEvent(
  pageUrl: string,
  opts?: { title?: string | null },
): Promise<ChicagoCheapEnrichment | null> {
  if (!/chicagoonthecheap\.com/i.test(pageUrl)) return null;

  const html = await fetchText(pageUrl);
  const $ = cheerio.load(html);

  const description = extractArticleDescription($);
  const imageUrl = extractHeroImage($);
  const subEvents = parseLotcEventBoxes($);
  const matched = matchSubEvent(subEvents, opts?.title);
  const postTitle = decodeEntities(
    $("h1.entry-title, h1").first().text().replace(/\s+/g, " ").trim(),
  );
  const taxonomy = categoriesFromPost($, postTitle, description ?? "");

  if (
    !description &&
    !imageUrl &&
    !matched?.venueName &&
    subEvents.length === 0
  ) {
    return null;
  }

  return {
    description,
    sourcePageUrl: pageUrl,
    venueName: matched?.venueName ?? null,
    address: matched?.address ?? null,
    imageUrl,
    categories: taxonomy,
    tags: ["chicago_cheap", "calendar", ...postTags($)],
    isFree: matched?.isFree ?? null,
  };
}

async function backfillChicagoCheapDetails(
  events: NormalizedEvent[],
  concurrency: number,
): Promise<void> {
  const byUrl = new Map<string, NormalizedEvent[]>();
  for (const ev of events) {
    if (!ev.url?.includes("chicagoonthecheap.com")) continue;
    const list = byUrl.get(ev.url) ?? [];
    list.push(ev);
    byUrl.set(ev.url, list);
  }
  const urls = [...byUrl.keys()];
  if (!urls.length) return;

  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++]!;
      const rows = byUrl.get(url)!;
      try {
        const html = await fetchText(url);
        const $ = cheerio.load(html);
        const description = extractArticleDescription($);
        const imageUrl = extractHeroImage($);
        const subEvents = parseLotcEventBoxes($);
        const postTitle = decodeEntities(
          $("h1.entry-title, h1").first().text().replace(/\s+/g, " ").trim(),
        );
        const baseCategories = categoriesFromPost($, postTitle, description ?? "");
        const baseTags = ["chicago_cheap", "calendar", ...postTags($)];

        for (const ev of rows) {
          const matched = matchSubEvent(subEvents, ev.title);
          applyEnrichment(ev, {
            description,
            sourcePageUrl: url,
            venueName: matched?.venueName ?? null,
            address: matched?.address ?? null,
            imageUrl,
            categories: baseCategories,
            tags: baseTags,
            isFree: matched?.isFree ?? null,
          });
        }
      } catch {
        /* best-effort */
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );
}

function applyEnrichment(
  ev: NormalizedEvent,
  fresh: ChicagoCheapEnrichment,
): void {
  if (fresh.description) ev.description = fresh.description;
  if (fresh.imageUrl) ev.imageUrl = fresh.imageUrl;
  if (fresh.venueName && !ev.venueName) ev.venueName = fresh.venueName;
  if (fresh.address && !ev.address) ev.address = fresh.address;
  if (fresh.isFree != null && ev.isFree == null) ev.isFree = fresh.isFree;
  if (fresh.categories.length) {
    ev.categories = [...new Set([...(ev.categories ?? []), ...fresh.categories])];
  }
  if (fresh.tags.length) {
    ev.tags = [...new Set([...(ev.tags ?? []), ...fresh.tags])];
  }
  ev.rawPayload = {
    ...((ev.rawPayload as Record<string, unknown> | null) ?? {}),
    sourcePageUrl: fresh.sourcePageUrl,
    enrichedAt: new Date().toISOString(),
  };
}

function extractArticleDescription($: cheerio.CheerioAPI): string | null {
  const paras: string[] = [];
  const entry = $(".entry-content").first();
  if (!entry.length) return null;

  entry.children().each((_, el) => {
    const node = $(el);
    const tag = el.tagName?.toLowerCase();
    if (
      tag === "div" &&
      (node.hasClass("lotc-event-list") ||
        node.hasClass("lotc-event-all-details") ||
        node.find(".lotc-event-box").length > 0)
    ) {
      return false;
    }
    if (tag !== "p") return;

    if (node.find("img").length && node.text().replace(/\s+/g, " ").trim().length < 25) {
      return;
    }

    const text = decodeEntities(node.text().replace(/\s+/g, " ").trim());
    if (!isArticleParagraph(text)) return;
    paras.push(text);
  });

  let description =
    paras.length > 0 ? paras.slice(0, 6).join("\n\n") : null;
  if (!description) {
    const og = $('meta[property="og:description"]').attr("content")?.trim();
    description = og ? decodeEntities(og) : null;
  }
  if (description && description.length > 4000) {
    description = description.slice(0, 4000);
  }
  return description;
}

function isArticleParagraph(text: string): boolean {
  if (text.length < 25) return false;
  if (/[<>]|srcset=|wp-image-|decoding="async"/i.test(text)) return false;
  if (/^photo courtesy\b/i.test(text)) return false;
  if (/^share\b|facebook|twitter|related posts/i.test(text)) return false;
  if (/^disclaimer:/i.test(text)) return false;
  if (/^←|^→/.test(text)) return false;
  // Bare venue lines without narrative copy
  if (
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4},\s*\d/.test(text) &&
    !/\b(will|the|and|with|enjoy|celebrate|head to|prepare)\b/i.test(text)
  ) {
    return false;
  }
  if (/^\d+\s+[A-Z][a-z]+\.?(?:\s+(?:St|Ave|Blvd)\.?)?,/i.test(text)) {
    return false;
  }
  return true;
}

function extractHeroImage($: cheerio.CheerioAPI): string | null {
  const raw =
    $('meta[property="og:image"]').attr("content")?.trim() ||
    $("img.wp-post-image").attr("src")?.trim() ||
    $(".entry-content img[src*='wp-content/uploads']")
      .not("[src^='data:']")
      .first()
      .attr("src")
      ?.trim() ||
    null;
  return raw && !raw.startsWith("data:") ? raw : null;
}

export function parseLotcEventBoxes($: cheerio.CheerioAPI): ChicagoCheapSubEvent[] {
  const out: ChicagoCheapSubEvent[] = [];
  $(".lotc-event-box").each((_, box) => {
    const node = $(box);
    const title = decodeEntities(
      node.find(".lotc-event-what .lotc-event-details").text().replace(/\s+/g, " ").trim(),
    );
    if (!title) return;

    const whenEl = node.find(".lotc-event-when .lotc-event-details");
    const startsAt =
      whenEl.find('meta[itemprop="startDate"]').attr("content")?.trim() ?? null;
    const endsAt =
      whenEl.find('meta[itemprop="endDate"]').attr("content")?.trim() ?? null;

    const venueName =
      decodeEntities(
        node.find('.lotc-event-where [itemprop="name"]').text().replace(/\s+/g, " ").trim(),
      ) || null;
    const street = node
      .find('[itemprop="streetAddress"]')
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const city = node.find('[itemprop="addressLocality"]').text().trim();
    const region = node.find('[itemprop="addressRegion"]').text().trim();
    const zip = node.find('[itemprop="postalCode"]').text().trim();
    const address =
      [street, [city, region, zip].filter(Boolean).join(", ")].filter(Boolean).join(", ") ||
      null;

    const costText = node.find(".lotc-event-cost .lotc-event-details").text();
    const isFree =
      node
        .find('.lotc-event-cost meta[itemprop="isAccessibleForFree"]')
        .attr("content") === "true" || /\bfree\b/i.test(costText);

    out.push({ title, startsAt, endsAt, venueName, address, isFree });
  });
  return out;
}

export function matchSubEvent(
  subEvents: ChicagoCheapSubEvent[],
  listingTitle?: string | null,
): ChicagoCheapSubEvent | null {
  if (!subEvents.length) return null;
  const needle = normalizeTitle(listingTitle ?? "");
  if (!needle) return subEvents[0] ?? null;

  for (const sub of subEvents) {
    const hay = normalizeTitle(sub.title);
    if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
      return sub;
    }
  }
  return subEvents[0] ?? null;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categoriesFromPost(
  $: cheerio.CheerioAPI,
  title: string,
  body: string,
): string[] {
  const hints = $('a[rel="category tag"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .join(" ");
  return categoriesFromText(title, `${body} ${hints}`, "");
}

function postTags($: cheerio.CheerioAPI): string[] {
  return $('a[rel="tag"]')
    .map((_, el) => $(el).text().trim().toLowerCase().replace(/\s+/g, "_"))
    .get()
    .filter(Boolean)
    .slice(0, 8);
}
