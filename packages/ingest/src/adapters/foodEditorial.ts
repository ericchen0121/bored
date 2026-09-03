import * as cheerio from "cheerio";
import {
  decodeHtmlEntities,
  isCuratedFoodDealPlaceholderImage,
} from "@bored/shared";
import { enrichInfatuationEvent } from "./food.js";
import { fetchGooglePlacePhoto } from "./googlePlacePhoto.js";
import { fetchText, type NormalizedEvent } from "../types.js";

export type FoodEditorialOutlet =
  | "infatuation"
  | "eater_sf"
  | "eater_chi"
  | "eater_la"
  | "sf_chronicle"
  | "sf_standard"
  | "tablehopper"
  | "found_sf";

export type FoodEditorialEnrichment = {
  description: string | null;
  imageUrl: string | null;
  headline: string | null;
  author: string | null;
  authorAvatarUrl: string | null;
  published: Date | null;
  outlet: FoodEditorialOutlet;
  organizer: string | null;
  venueName?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  rating?: number | null;
  tags?: string[];
  rawPayload: Record<string, unknown>;
};

const OUTLET_LABELS: Record<FoodEditorialOutlet, string> = {
  infatuation: "The Infatuation",
  eater_sf: "Eater SF",
  eater_chi: "Eater Chicago",
  eater_la: "Eater LA",
  sf_chronicle: "SF Chronicle",
  sf_standard: "SF Standard",
  tablehopper: "Tablehopper",
  found_sf: "FOUND SF",
};

export type FoodDetailRow = Pick<
  NormalizedEvent,
  | "source"
  | "url"
  | "title"
  | "description"
  | "imageUrl"
  | "venueName"
  | "address"
  | "neighborhood"
  | "lat"
  | "lng"
  | "organizer"
  | "priceMin"
  | "priceMax"
  | "tags"
  | "rawPayload"
>;

export function outletFromFoodUrl(url: string): FoodEditorialOutlet | null {
  if (/theinfatuation\.com/i.test(url)) return "infatuation";
  if (/chicago\.eater\.com/i.test(url)) return "eater_chi";
  if (/la\.eater\.com/i.test(url)) return "eater_la";
  if (/sf\.eater\.com/i.test(url)) return "eater_sf";
  if (/\.eater\.com/i.test(url)) return "eater_sf";
  if (/sfchronicle\.com/i.test(url)) return "sf_chronicle";
  if (/sfstandard\.com/i.test(url)) return "sf_standard";
  if (/tablehopper\.com/i.test(url)) return "tablehopper";
  if (/itsfound\.com/i.test(url)) return "found_sf";
  return null;
}

export function foodEditorialOutletLabel(
  outlet: string | null | undefined,
): string | null {
  if (!outlet) return null;
  return OUTLET_LABELS[outlet as FoodEditorialOutlet] ?? null;
}

export function needsFoodEditorialEnrich(row: FoodDetailRow): boolean {
  if (!row.url) return false;
  const payload = (row.rawPayload as Record<string, unknown> | null) ?? {};
  const enrichedAt =
    typeof payload.enrichedAt === "string" ? payload.enrichedAt : null;
  const stale =
    !enrichedAt ||
    Date.now() - new Date(enrichedAt).getTime() > 7 * 24 * 3600 * 1000;
  if (!stale) return false;

  if (row.source === "food" && /theinfatuation\.com/i.test(row.url)) {
    if (payload.dollarPrice == null) return true;
    if (row.priceMin != null && row.priceMin > 4) return true;
  }

  return (
    !payload.author ||
    isCuratedFoodDealPlaceholderImage(row.imageUrl) ||
    !row.description ||
    row.description.length < 200
  );
}

/** Scrape editorial writeup + photo from Infatuation, Eater, Chronicle, Standard, Tablehopper, FOUND. */
export async function enrichFoodEditorial(
  url: string,
  opts?: { venueName?: string | null; outlet?: string | null },
): Promise<FoodEditorialEnrichment | null> {
  const outlet =
    (opts?.outlet as FoodEditorialOutlet | undefined) ??
    outletFromFoodUrl(url);
  if (!outlet) return null;

  try {
    switch (outlet) {
      case "infatuation":
        return enrichFromInfatuation(url);
      case "eater_sf":
      case "eater_chi":
      case "eater_la":
        return enrichFromHtmlArticle(url, outlet, opts?.venueName);
      case "sf_chronicle":
        return enrichFromHtmlArticle(url, "sf_chronicle", opts?.venueName);
      case "sf_standard":
        return enrichFromHtmlArticle(url, "sf_standard", opts?.venueName);
      case "tablehopper":
        return enrichFromHtmlArticle(url, "tablehopper", opts?.venueName);
      case "found_sf":
        return enrichFromFound(url);
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[foodEditorial] ${outlet} failed:`, (err as Error).message);
    return null;
  }
}

async function enrichFromInfatuation(
  url: string,
): Promise<FoodEditorialEnrichment | null> {
  const fresh = await enrichInfatuationEvent(url);
  if (!fresh) return null;
  const payload = (fresh.rawPayload as Record<string, unknown> | null) ?? {};
  return {
    description: fresh.description ?? null,
    imageUrl: fresh.imageUrl ?? null,
    headline:
      typeof payload.headline === "string" ? payload.headline : null,
    author: typeof payload.author === "string" ? payload.author : null,
    authorAvatarUrl:
      typeof payload.authorAvatarUrl === "string"
        ? payload.authorAvatarUrl
        : null,
    published: parseIso(payload.published),
    outlet: "infatuation",
    organizer: fresh.organizer ?? "The Infatuation",
    venueName: fresh.venueName,
    address: fresh.address,
    neighborhood: fresh.neighborhood,
    lat: fresh.lat,
    lng: fresh.lng,
    priceMin: fresh.priceMin,
    priceMax: fresh.priceMax,
    rating: typeof payload.rating === "number" ? payload.rating : null,
    tags: fresh.tags,
    rawPayload: { ...payload, outlet: "infatuation" },
  };
}

async function enrichFromHtmlArticle(
  url: string,
  outlet: Exclude<FoodEditorialOutlet, "infatuation" | "found_sf">,
  venueName?: string | null,
): Promise<FoodEditorialEnrichment | null> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const og = parseOpenGraph($);
  const jsonLd = parseArticleJsonLd(html);
  const venueSection = venueName
    ? extractVenueSection($, venueName)
    : { writeup: "", imageUrl: null as string | null };

  const paras = extractArticleParagraphs($);
  const writeup =
    venueSection.writeup ||
    paras.find((p) => p.length > 100) ||
    paras.join("\n\n").slice(0, 4000) ||
    decodeHtml(og.description ?? "") ||
    "";

  if (!writeup.trim()) return null;

  const headline = decodeHtml(og.title ?? jsonLd.headline ?? "");
  const author = cleanAuthor(
    jsonLd.author ?? og.author ?? $("meta[name='author']").attr("content"),
    outlet,
  );
  const published =
    parseIso(jsonLd.datePublished ?? og.published) ?? null;
  const imageUrl =
    venueSection.imageUrl ??
    og.image ??
    jsonLd.image ??
    $("article img, .article-body img, .entry-content img")
      .first()
      .attr("src") ??
    null;

  return {
    description: formatEditorialDescription({
      headline: headline || null,
      writeup: writeup.trim(),
      author,
      published,
      outlet,
    }),
    imageUrl: imageUrl ? absolutizeUrl(imageUrl, url) : null,
    headline: headline || null,
    author,
    authorAvatarUrl: null,
    published,
    outlet,
    organizer: author
      ? `${author} · ${OUTLET_LABELS[outlet]}`
      : OUTLET_LABELS[outlet],
    rawPayload: {
      outlet,
      headline: headline || null,
      preview: writeup.slice(0, 280),
      published: published?.toISOString() ?? null,
      author,
      link: url,
    },
  };
}

async function enrichFromFound(
  url: string,
): Promise<FoodEditorialEnrichment | null> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const og = parseOpenGraph($);
  const body =
    $(".post-content, .body, article").text().trim() ||
    extractArticleParagraphs($).join("\n\n");
  const writeup = body.slice(0, 4000) || decodeHtml(og.description ?? "");
  if (!writeup.trim()) return null;

  const headline = decodeHtml(og.title ?? "");
  const published = parseIso(og.published);

  return {
    description: formatEditorialDescription({
      headline: headline || null,
      writeup: writeup.trim(),
      author: null,
      published,
      outlet: "found_sf",
    }),
    imageUrl: og.image ? absolutizeUrl(og.image, url) : null,
    headline: headline || null,
    author: null,
    authorAvatarUrl: null,
    published,
    outlet: "found_sf",
    organizer: "FOUND SF",
    rawPayload: {
      outlet: "found_sf",
      headline: headline || null,
      preview: writeup.slice(0, 280),
      published: published?.toISOString() ?? null,
      link: url,
    },
  };
}

/** Lazy detail enrich for food tips and food deals — all editorial outlets + Google photo fallback. */
export async function enrichFoodEventDetail(
  row: FoodDetailRow,
): Promise<Partial<NormalizedEvent> | null> {
  const payload = (row.rawPayload as Record<string, unknown> | null) ?? {};
  const preserveDealFields = row.source === "food_deals";
  const needsEditorial = needsFoodEditorialEnrich(row);

  let patch: Partial<NormalizedEvent> = {};
  let mergedPayload = { ...payload };

  if (needsEditorial && row.url) {
    const primarySource = Array.isArray(payload.sources)
      ? String(payload.sources[0] ?? "")
      : null;
    const fresh = await enrichFoodEditorial(row.url, {
      venueName: row.venueName,
      outlet:
        (typeof payload.outlet === "string" ? payload.outlet : null) ??
        primarySource ??
        outletFromFoodUrl(row.url),
    });

    if (fresh) {
      patch = {
        description: fresh.description ?? row.description,
        imageUrl: fresh.imageUrl
          ? fresh.imageUrl
          : isCuratedFoodDealPlaceholderImage(row.imageUrl)
            ? null
            : (row.imageUrl ?? null),
        venueName: preserveDealFields
          ? (row.venueName ?? fresh.venueName)
          : (fresh.venueName ?? row.venueName),
        address: fresh.address ?? row.address,
        neighborhood: row.neighborhood ?? fresh.neighborhood,
        lat: fresh.lat ?? row.lat,
        lng: fresh.lng ?? row.lng,
        organizer: fresh.organizer ?? row.organizer,
        priceMin: fresh.priceMin ?? row.priceMin,
        priceMax: fresh.priceMax ?? row.priceMax,
        tags: [
          ...new Set([
            ...((row.tags as string[] | undefined) ?? []),
            ...(fresh.tags ?? []),
            fresh.outlet,
          ]),
        ],
        ...(preserveDealFields
          ? {}
          : row.source === "food" && fresh.venueName
            ? { title: fresh.venueName ?? row.title }
            : {}),
      };
      mergedPayload = {
        ...mergedPayload,
        ...fresh.rawPayload,
        ...(preserveDealFields
          ? {
              dealId: payload.dealId,
              dealKind: payload.dealKind,
              dealSummary: payload.dealSummary,
              schedule: payload.schedule,
              sources: payload.sources,
              rating: payload.rating ?? fresh.rating ?? null,
            }
          : {}),
        outlet: fresh.outlet,
        enrichedAt: new Date().toISOString(),
      };
    }
  }

  const imageAfter = patch.imageUrl ?? row.imageUrl ?? null;
  if (isCuratedFoodDealPlaceholderImage(imageAfter)) {
    const googlePhoto = await fetchGooglePlacePhoto({
      venueName: patch.venueName ?? row.venueName,
      address: patch.address ?? row.address,
      neighborhood: patch.neighborhood ?? row.neighborhood,
    });
    if (googlePhoto) {
      patch.imageUrl = googlePhoto;
      mergedPayload = {
        ...mergedPayload,
        photoSource: "google_maps",
        enrichedAt: new Date().toISOString(),
      };
    } else if (!patch.imageUrl && row.imageUrl) {
      // Keep curated Unsplash if Google has nothing.
      patch.imageUrl = row.imageUrl;
    }
  }

  if (!Object.keys(patch).length && mergedPayload === payload) return null;

  return { ...patch, rawPayload: mergedPayload };
}

function parseOpenGraph($: cheerio.CheerioAPI) {
  return {
    title: $('meta[property="og:title"]').attr("content")?.trim() || null,
    description:
      $('meta[property="og:description"]').attr("content")?.trim() || null,
    image: $('meta[property="og:image"]').attr("content")?.trim() || null,
    author:
      $('meta[property="article:author"]').attr("content")?.trim() ||
      $('meta[name="author"]').attr("content")?.trim() ||
      null,
    published:
      $('meta[property="article:published_time"]').attr("content")?.trim() ||
      null,
  };
}

function parseArticleJsonLd(html: string) {
  const out: {
    headline?: string;
    author?: string;
    datePublished?: string;
    image?: string;
  } = {};
  for (const m of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(m[1]!);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as Record<string, unknown>;
        if (n["@type"] !== "Article" && n["@type"] !== "NewsArticle") continue;
        if (typeof n.headline === "string") out.headline = n.headline;
        if (typeof n.datePublished === "string") {
          out.datePublished = n.datePublished;
        }
        const author = n.author as
          | { name?: string }
          | { name?: string }[]
          | string
          | undefined;
        if (typeof author === "string") out.author = author;
        else if (Array.isArray(author)) {
          out.author = author[0]?.name;
        } else if (author?.name) out.author = author.name;
        const image = n.image as string | { url?: string } | undefined;
        if (typeof image === "string") out.image = image;
        else if (image?.url) out.image = image.url;
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return out;
}

function extractVenueSection(
  $: cheerio.CheerioAPI,
  venueName: string,
): { writeup: string; imageUrl: string | null } {
  const needles = venueName
    .toLowerCase()
    .split(/[\s'’]+/)
    .filter((n) => n.length > 2);
  const primary = needles[0] ?? venueName.toLowerCase();
  let writeup = "";
  let imageUrl: string | null = null;

  $("a[href*='/venue/']").each((_, el) => {
    const linkText = $(el).text().trim().toLowerCase();
    if (
      !needles.some((n) => linkText.includes(n)) &&
      !linkText.includes(primary)
    ) {
      return;
    }
    const text = $(el).closest("p").text().trim();
    if (text.length > writeup.length) writeup = text;
    const img = $(el)
      .closest("section, article, div")
      .find("img")
      .first()
      .attr("src");
    if (img) imageUrl = img;
  });

  $("h2,h3,h4,strong").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (
      !needles.some((n) => heading.includes(n)) &&
      !heading.includes(primary)
    ) {
      return;
    }
    const chunks: string[] = [];
    let sib = $(el).next();
    for (let i = 0; i < 8 && sib.length; i++) {
      const tag = sib.prop("tagName")?.toLowerCase();
      if (tag && /^h[2-4]$/.test(tag)) break;
      if (tag === "p" || tag === "li") {
        const t = sib.text().trim();
        if (t.length > 40) chunks.push(t);
      }
      sib = sib.next();
    }
    const joined = chunks.join("\n\n");
    if (joined.length > writeup.length) writeup = joined;
    const img = $(el).nextAll("img, figure img").first().attr("src");
    if (img) imageUrl = imageUrl ?? img;
  });

  return { writeup, imageUrl };
}

function extractArticleParagraphs($: cheerio.CheerioAPI): string[] {
  const selectors = [
    "article p",
    ".article-body p",
    ".entry-content p",
    ".post-content p",
    ".duet--article--standard-paragraph",
    "main p",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.length < 60 || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    });
    if (out.length >= 6) break;
  }
  return out;
}

function formatEditorialDescription(opts: {
  headline?: string | null;
  writeup: string;
  author: string | null;
  published: Date | null;
  outlet: FoodEditorialOutlet;
}): string {
  const parts: string[] = [];
  if (opts.headline?.trim()) parts.push(opts.headline.trim());
  if (opts.writeup.trim()) parts.push(opts.writeup.trim());
  const when = opts.published
    ? opts.published.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const label = OUTLET_LABELS[opts.outlet];
  const byline = [opts.author, when, label].filter(Boolean).join(" · ");
  if (byline) parts.push(`— ${byline}`);
  return parts.join("\n\n");
}

function cleanAuthor(
  raw: string | null | undefined,
  outlet: FoodEditorialOutlet,
): string | null {
  if (!raw?.trim()) {
    return outlet === "tablehopper" ? "Marcia Gagliardi" : null;
  }
  const val = decodeHtml(raw.trim());
  if (/^https?:\/\//i.test(val) || /facebook\.com/i.test(val)) {
    return outlet === "tablehopper" ? "Marcia Gagliardi" : null;
  }
  return val;
}

function decodeHtml(text: string): string {
  return decodeHtmlEntities(text);
}

function parseIso(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function absolutizeUrl(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}
