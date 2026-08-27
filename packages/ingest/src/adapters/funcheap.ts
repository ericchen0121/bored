import * as cheerio from "cheerio";
import {
  contentHash,
  fetchText,
  parsePrice,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

/**
 * Funcheap calendar listings (today / weekend / day archives).
 * RSS alone is publication-order and often only far-future posts —
 * calendar pages carry real near-term `data-event-date` timestamps.
 */
const LISTING_PATHS = ["/today/", "/weekend/"] as const;

/** Funcheap editorial slugs that aren't event types */
const FUNCHEAP_SKIP_SLUGS = new Set([
  "select-one-location",
  "in-person",
  "top-pick",
  "community",
  "early-bird-presale",
  "sponsored",
  "links",
  "event-unconfirmed",
  "san-francisco-bay-area",
  "downtown-san-francisco",
  "east-bay",
  "funcheap-presents",
  "annual-event-2",
  "other",
]);

export const funcheapAdapter: SourceAdapter = {
  id: "funcheap",
  description: "SF Funcheap calendar (today + weekend + next week)",
  async fetch() {
    const urls = [
      ...LISTING_PATHS.map((p) => `https://sf.funcheap.com${p}`),
      ...dayArchiveUrls(7),
    ];

    const byId = new Map<string, NormalizedEvent>();

    for (const url of urls) {
      let html: string;
      try {
        html = await fetchText(url);
      } catch {
        continue;
      }
      for (const ev of parseListingPage(html)) {
        byId.set(ev.sourceEventId, ev);
      }
    }

    // RSS: keep far-out editorial posts that may not be on day archives yet
    try {
      for (const ev of await parseRssFeed()) {
        if (!byId.has(ev.sourceEventId)) byId.set(ev.sourceEventId, ev);
      }
    } catch {
      /* calendar pages are the primary source */
    }

    const events = [...byId.values()];
    await backfillFuncheapImages(events, 8);

    return { events };
  },
};

function dayArchiveUrls(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  // Funcheap day archives are America/Los_Angeles calendar days
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) out.push(`https://sf.funcheap.com/${y}/${m}/${day}/`);
  }
  return out;
}

function parseListingPage(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const events: NormalizedEvent[] = [];

  $("div.post, tr[id^='post-']").each((_, el) => {
    const node = $(el);
    const meta = node.find("[data-event-date]").first();
    const dateRaw = meta.attr("data-event-date")?.trim();
    if (!dateRaw) return;

    const linkEl = node.find("a[rel='bookmark']").first();
    const href = linkEl.attr("href")?.trim();
    const title = decodeEntities(
      (linkEl.attr("title") || linkEl.text() || "").replace(/\s+/g, " ").trim(),
    );
    if (!href || !title) return;

    const startsAt = parseFuncheapDate(dateRaw);
    if (!startsAt) return;

    const endRaw = meta.attr("data-event-date-end")?.trim();
    const endsAt = endRaw ? parseFuncheapDate(endRaw) : null;

    const costText = node.find(".cost").parent().text() || node.text();
    const bodySnippet = node.find("p").first().text().slice(0, 500);
    const { priceMin, priceMax, isFree } = parsePrice(`${title} ${costText}`);
    const free =
      isFree ||
      /\bfree\b/i.test(costText) ||
      /\bfree\b/i.test(title);

    const classes = (node.attr("class") ?? "").toLowerCase();
    const slugs = parseFuncheapCategorySlugs(classes);
    const { categories, tags } = funcheapTaxonomy(
      slugs,
      title,
      `${costText} ${bodySnippet}`,
    );
    const city = inferCity(classes, title);
    const slug = href.replace(/\/$/, "").split("/").pop() ?? href;
    const sourceEventId = contentHash([slug, dateRaw]);
    const pageUrl = href.startsWith("http") ? href : `https://sf.funcheap.com${href}`;
    let imageUrl: string | null = null;
    const thumb = node.find(".thumbnail-wrapper img").first();
    if (thumb.length) {
      const src = thumb.attr("src") ?? "";
      if (src.startsWith("data:image/svg")) {
        try {
          const b64 = src.replace(/^data:image\/svg\+xml;base64,/, "");
          const decoded = Buffer.from(b64, "base64").toString("utf8");
          const dataU = decoded.match(/data-u="([^"]+)"/)?.[1];
          if (dataU) imageUrl = normalizeFuncheapCdnUrl(decodeURIComponent(dataU));
        } catch {
          /* ignore malformed placeholder */
        }
      }
      if (!imageUrl) {
        const noscriptSrc = thumb.parent().find("noscript img").attr("src")?.trim();
        if (noscriptSrc) imageUrl = normalizeFuncheapCdnUrl(noscriptSrc);
      }
      if (!imageUrl && src && !src.startsWith("data:")) {
        imageUrl = normalizeFuncheapCdnUrl(src);
      }
    }

    events.push({
      source: "funcheap",
      sourceEventId,
      title,
      startsAt,
      endsAt,
      timezone: "America/Los_Angeles",
      city,
      priceMin: free ? 0 : priceMin,
      priceMax,
      isFree: free,
      categories,
      tags,
      imageUrl,
      url: pageUrl,
      rawPayload: {
        dateRaw,
        endRaw,
        classes,
        slugs,
        sourcePageUrl: pageUrl,
        page: "calendar",
      },
    });
  });

  return events;
}

async function parseRssFeed(): Promise<NormalizedEvent[]> {
  const { XMLParser } = await import("fast-xml-parser");
  const xml = await fetchText("https://sf.funcheap.com/feed/");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];
  const events: NormalizedEvent[] = [];

  for (const item of list) {
    const title = decodeEntities(String(item.title ?? "").trim());
    const link = String(item.link ?? "").trim();
    const description = stripHtml(
      String(item.description ?? item["content:encoded"] ?? ""),
    );
    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
    if (!title || !link) continue;

    const { priceMin, priceMax, isFree } = parsePrice(`${title} ${description}`);
    const startsAt = extractDateFromTitle(title) ?? pubDate;
    // Skip RSS rows that are already past or lacking a real event date
    if (startsAt.getTime() < Date.now() - 6 * 3600000) continue;
    if (startsAt.getTime() - pubDate.getTime() < 12 * 3600000) {
      // Title date missing → pubDate used; not useful for feed windows
      if (!extractDateFromTitle(title)) continue;
    }

    const slug = link.replace(/\/$/, "").split("/").pop() ?? link;
    const sourceEventId = contentHash([
      slug,
      startsAt.toISOString().slice(0, 10),
    ]);
    const { categories, tags } = funcheapTaxonomy([], title, description);

    events.push({
      source: "funcheap",
      sourceEventId,
      title,
      description: description.slice(0, 2000),
      startsAt,
      city: inferCity("", title),
      priceMin,
      priceMax,
      isFree: isFree || /free/i.test(title),
      categories,
      tags: [...tags, "rss"],
      url: link,
      rawPayload: { title, link, pubDate: item.pubDate, page: "rss" },
    });
  }

  return events;
}

/** Parse `category-*` slugs from Funcheap post CSS classes. */
export function parseFuncheapCategorySlugs(classes: string): string[] {
  const slugs: string[] = [];
  for (const m of classes.matchAll(/\bcategory-([a-z0-9-]+)/g)) {
    const slug = m[1]!;
    if (!FUNCHEAP_SKIP_SLUGS.has(slug)) slugs.push(slug);
  }
  return slugs;
}

/**
 * Map Funcheap editorial slugs (+ title/body hints) to interest categories
 * and scannable feed tags. Uses priority rules so comedy beats live-music,
 * games beat brewery food tags, etc.
 */
export function funcheapTaxonomy(
  slugs: string[],
  title: string,
  body: string,
): { categories: string[]; tags: string[] } {
  const slugSet = new Set(slugs);
  const text = `${title} ${body}`.toLowerCase();
  const categories = new Set<string>();
  const tags = new Set<string>(["funcheap"]);

  const hasComedy =
    slugSet.has("comedy-event-types-event") ||
    /comedy|standup|stand-up|stand up|improv/i.test(text);
  const hasGames =
    slugSet.has("fun-games") ||
    slugSet.has("geek-event") ||
    /tournament|fighting game|board game|video game|esports|avatar fighters/i.test(
      text,
    );
  const hasNightMarket =
    slugSet.has("night-market") || /night market/i.test(text);
  const hasLiveMusic =
    slugSet.has("live-music-event") || slugSet.has("club-dj");
  const hasTheater = slugSet.has("theater-performance");
  const hasLecture =
    slugSet.has("lectures-workshops") ||
    /\btalk\b|lecture|workshop|panel discussion/i.test(text);
  const hasPolitics =
    slugSet.has("political-activism") || /politic/i.test(text);
  const hasFoodSlug = slugSet.has("eating-drinking");
  const hasOutdoors = slugSet.has("outdoors");
  const hasSports = slugSet.has("sports-fitness");
  const hasKids = slugSet.has("kids-families");
  const hasLiterature = slugSet.has("literature");
  const hasHistory = slugSet.has("history");
  const hasMovies =
    slugSet.has("movies") || /film|movie|cinema|drive-in/i.test(text);
  const hasTechTitle =
    /\b(ai |agents?|startup|developer|hackathon|tech |builders? night)\b/i.test(
      text,
    );

  if (hasComedy) {
    categories.add("comedy.showcase");
    tags.add("comedy");
  }
  if (hasGames && !hasNightMarket && !hasComedy) {
    tags.add("games");
    if (/tournament|fighters|esports/i.test(text)) tags.add("tournament");
  }
  if (hasNightMarket) {
    categories.add("food");
    tags.add("night market");
  }
  if (hasPolitics) tags.add("politics");
  if (hasLecture) {
    categories.add("tech");
    tags.add("talk");
  }
  if (hasLiveMusic && !hasComedy && !hasTheater && !hasNightMarket) {
    categories.add("music.live");
  }
  if (slugSet.has("club-dj")) categories.add("music.electronic");
  if (hasTheater && !hasComedy) categories.add("arts");
  if (hasOutdoors) categories.add("outdoors");
  if (hasSports) {
    categories.add("outdoors");
    tags.add("sports");
  }
  if (hasKids) categories.add("family");
  if (hasLiterature) {
    categories.add("arts");
    tags.add("literature");
  }
  if (hasHistory) {
    categories.add("arts");
    tags.add("history");
  }
  if (hasMovies) categories.add("movies");

  // Food: direct slug, night markets, or title copy — but not when event is games/comedy at a brewery
  const foodInCopy =
    /food|dinner|brunch|taco|margarita|mole|tasting|food truck|vendor/i.test(
      text,
    );
  if (hasNightMarket || (hasFoodSlug && !hasGames && !hasComedy)) {
    categories.add("food");
  } else if (hasFoodSlug && (hasComedy || hasGames) && foodInCopy) {
    categories.add("food");
  } else if (!hasFoodSlug && foodInCopy && !hasGames) {
    categories.add("food");
  }

  if (slugSet.has("fairs-festivals")) tags.add("festival");
  if (slugSet.has("shopping-fashion")) tags.add("shopping");
  if (hasTechTitle && !hasComedy) categories.add("tech");

  if (/\bfree\b/i.test(text)) categories.add("free");

  // RSS / sparse rows — fall back to coarse text heuristics
  if (slugs.length === 0) {
    if (/concert|dj set|live music|jazz band/i.test(text) && !hasComedy) {
      categories.add("music.live");
    }
    if (/art|gallery|museum/i.test(text)) categories.add("arts");
    if (/outdoor|park|hike|bike/i.test(text)) categories.add("outdoors");
    if (/nightlife|club night|party/i.test(text)) categories.add("nightlife");
  }

  if (categories.size === 0) categories.add("free");

  return { categories: [...categories], tags: [...tags] };
}

/** Prefer direct cdn.funcheap.com URLs over ShortPixel proxy paths. */
export function normalizeFuncheapCdnUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const uploadPath = trimmed.match(
    /(?:cdn\.funcheap\.com|sf\.funcheap\.com)(\/wp-content\/uploads\/[^?]+)/i,
  )?.[1];
  if (uploadPath) return `https://cdn.funcheap.com${uploadPath}`;

  if (/img\.evbuc\.com|evbuc\.com/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

async function backfillFuncheapImages(
  events: NormalizedEvent[],
  concurrency: number,
): Promise<void> {
  const missing = events.filter((ev) => !ev.imageUrl && ev.url?.includes("funcheap.com"));
  if (!missing.length) return;

  let idx = 0;
  async function worker() {
    while (idx < missing.length) {
      const ev = missing[idx++]!;
      try {
        ev.imageUrl = await fetchFuncheapPostImage(ev.url!);
      } catch {
        /* best-effort */
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()),
  );
}

/** Pull og:image from a Funcheap post (listing thumbnails are often lazy). */
export async function fetchFuncheapPostImage(pageUrl: string): Promise<string | null> {
  if (!/funcheap\.com/i.test(pageUrl)) return null;
  const html = await fetchText(pageUrl);
  const $ = cheerio.load(html);
  const raw =
    $('meta[property="og:image"]').attr("content")?.trim() ||
    $("img.wp-post-image").attr("src")?.trim() ||
    $("img.attachment-post-thumbnail").attr("src")?.trim() ||
    null;
  return raw && !raw.startsWith("data:") ? normalizeFuncheapCdnUrl(raw) : null;
}

export type EventbriteEnrichment = {
  imageUrl: string | null;
  description: string | null;
  tags: string[];
  categories: string[];
};

/** Scrape public Eventbrite listing metadata linked from Funcheap posts. */
export async function enrichEventbriteListing(
  url: string,
): Promise<EventbriteEnrichment | null> {
  if (!/eventbrite\.com/i.test(url)) return null;

  let html: string;
  try {
    html = await fetchText(url);
  } catch {
    return null;
  }

  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ??
    $("title").text().trim();
  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ?? null;
  const imageRaw = $('meta[property="og:image"]').attr("content")?.trim() ?? null;
  const imageUrl = imageRaw ? normalizeFuncheapCdnUrl(imageRaw) : null;

  const text = `${title} ${description ?? ""}`.toLowerCase();
  const tags = new Set<string>(["eventbrite"]);
  const categories = new Set<string>();

  if (/comedy|standup|stand-up|improv/i.test(text)) {
    categories.add("comedy.showcase");
    tags.add("comedy");
  }
  if (/concert|live music|dj\b|band\b/i.test(text) && !tags.has("comedy")) {
    categories.add("music.live");
  }
  if (/food|tasting|dinner|brunch/i.test(text)) categories.add("food");
  if (/workshop|lecture|talk|panel|networking|tech|startup|ai\b/i.test(text)) {
    categories.add("tech");
    if (/\btalk\b|lecture|panel/i.test(text)) tags.add("talk");
  }
  if (/tournament|game|gaming|esports/i.test(text)) tags.add("games");
  if (/free\b/i.test(text)) categories.add("free");

  return {
    imageUrl,
    description,
    tags: [...tags],
    categories: [...categories],
  };
}

/** `data-event-date` is local wall time without offset — treat as Pacific. */
function parseFuncheapDate(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-07:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferCity(classes: string, title: string): string {
  const t = `${classes} ${title}`.toLowerCase();
  if (t.includes("oakland") || t.includes("region-east-bay")) return "oakland";
  if (t.includes("berkeley")) return "berkeley";
  if (t.includes("san jose") || t.includes("south-bay")) return "san_jose";
  if (t.includes("healdsburg") || t.includes("marin") || t.includes("north-bay"))
    return "marin";
  return "sf";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function extractDateFromTitle(title: string): Date | null {
  const numeric = title.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    const d = new Date(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T18:00:00-07:00`,
    );
    if (!Number.isNaN(d.getTime())) return d;
  }

  const m = title.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i,
  );
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]}, ${new Date().getFullYear()} 18:00:00 GMT-7`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  if (d.getTime() < now.getTime() - 12 * 3600000) {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

function parseDetailCategorySlugs($: cheerio.CheerioAPI): string[] {
  const slugs: string[] = [];
  $('a[rel="category tag"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const slug =
      href.match(/\/category\/(?:event\/event-types\/|event-type\/|event\/|)([^/]+)\/?$/i)?.[1] ??
      href.match(/\/category\/([^/]+)\/?$/i)?.[1];
    if (slug) {
      const normalized = slug.toLowerCase().replace(/_/g, "-");
      if (!FUNCHEAP_SKIP_SLUGS.has(normalized)) slugs.push(normalized);
    }
  });
  return slugs;
}

function mergeTaxonomy(
  a: { categories: string[]; tags: string[] },
  b: { categories: string[]; tags: string[] },
): { categories: string[]; tags: string[] } {
  return {
    categories: [...new Set([...a.categories, ...b.categories])],
    tags: [...new Set([...a.tags, ...b.tags])],
  };
}

export type FuncheapEnrichment = {
  description: string | null;
  /** External "Event Details" CTA (Instagram, Eventbrite, …) */
  eventDetailsUrl: string | null;
  /** Funcheap post URL used for the scrape */
  sourcePageUrl: string;
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
};

/**
 * Lazy detail enrich for Funcheap posts — description + Event Details link.
 * Called on event detail open (mirrors Luma registration refresh).
 * Content is static editorial, so we cache once in DB after first open.
 */
export async function enrichFuncheapEvent(
  pageUrl: string,
  opts?: { title?: string | null },
): Promise<FuncheapEnrichment | null> {
  if (!/funcheap\.com/i.test(pageUrl)) return null;
  const html = await fetchText(pageUrl);
  const $ = cheerio.load(html);

  const detailsHref =
    $('a.event__button[name="Event Details"]').attr("href")?.trim() ||
    $("h3.url.event a.event__button").attr("href")?.trim() ||
    null;

  const eventDetailsUrl = detailsHref || null;

  const paras: string[] = [];
  $(".entry.clearfloat p, .entry-content p, .entry p").each((_, el) => {
    const text = decodeEntities($(el).text().replace(/\s+/g, " ").trim());
    if (text.length < 25) return;
    if (/^share\b|facebook|twitter|related posts/i.test(text)) return;
    if (/^disclaimer:/i.test(text)) return;
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

  const venueName =
    decodeEntities(
      $('a[href*="/venue/"]').first().text().replace(/\s+/g, " ").trim(),
    ) || null;

  const region =
    decodeEntities(
      $(".region-links a").first().text().replace(/\s+/g, " ").trim(),
    ) || null;

  // Prefer text after venue link: "Venue | 24th St. & Sanchez St, San Francisco, CA"
  let address: string | null = null;
  const statsLeft = $("#stats .left").first().clone();
  statsLeft.find("style, script, .region-links, .cost").remove();
  const statsPlain = decodeEntities(
    statsLeft.text().replace(/\s+/g, " ").trim(),
  );
  if (venueName && statsPlain.includes(venueName)) {
    const after = statsPlain.split(venueName).slice(1).join(venueName);
    const m = after.match(
      /^\s*\|\s*([^|]+?(?:San Francisco|Oakland|Berkeley|, CA)[^|]*)/i,
    );
    if (m) address = m[1]!.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  }

  const imageUrl =
    normalizeFuncheapCdnUrl(
      $('meta[property="og:image"]').attr("content")?.trim() ?? "",
    ) ||
    normalizeFuncheapCdnUrl($("img.wp-post-image").attr("src")?.trim() ?? "") ||
    normalizeFuncheapCdnUrl(
      $("img.attachment-post-thumbnail").attr("src")?.trim() ?? "",
    ) ||
    null;

  const title =
    opts?.title?.trim() ||
    decodeEntities($("h1.entry-title, h1.title").first().text().trim()) ||
    "";
  const detailSlugs = parseDetailCategorySlugs($);
  const postClasses = ($("article.post, div.post").first().attr("class") ?? "").toLowerCase();
  const classSlugs = parseFuncheapCategorySlugs(postClasses);
  const slugs = [...new Set([...detailSlugs, ...classSlugs])];
  let taxonomy = funcheapTaxonomy(slugs, title, `${description ?? ""}`);

  let eventbriteImage: string | null = null;
  if (eventDetailsUrl?.includes("eventbrite.com")) {
    const eb = await enrichEventbriteListing(eventDetailsUrl);
    if (eb) {
      taxonomy = mergeTaxonomy(taxonomy, eb);
      if (!description && eb.description) description = eb.description;
      eventbriteImage = eb.imageUrl;
    }
  }

  const finalImage = imageUrl || eventbriteImage;

  if (
    !description &&
    !eventDetailsUrl &&
    !venueName &&
    !finalImage &&
    taxonomy.categories.length <= 1
  ) {
    return null;
  }

  return {
    description,
    eventDetailsUrl,
    sourcePageUrl: pageUrl,
    venueName,
    address,
    neighborhood: region,
    imageUrl: finalImage,
    categories: taxonomy.categories,
    tags: taxonomy.tags,
  };
}
