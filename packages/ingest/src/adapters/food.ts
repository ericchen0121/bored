import { XMLParser } from "fast-xml-parser";
import {
  categoriesForFoundSection,
  extractFoundSectionHint,
  FOOD_METRO_CONFIGS,
  FOUND_NON_FOOD_SECTIONS,
  suggestionStartsAt,
  decodeHtmlEntities,
  stripHtmlToText,
  type FoodMetroConfig,
  cityKeyFromLabel,
} from "@bored/shared";
import {
  contentHash,
  fetchText,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

/**
 * Phase 2: Food recommendations (evergreen “where to eat” tips).
 *
 * Per-metro sources (see FOOD_METRO_CONFIGS in @bored/shared):
 * - Eater Atom RSS (maps, dining reports, openings)
 * - The Infatuation reviews (list + detail pages)
 * - FOUND SF Substack RSS (SF only)
 *
 * These are editorial tips, not timed events. We place each tip on a stable
 * near-term dinner slot so it lands in tonight / weekend / for_you windows
 * without inventing fake showtimes.
 */

export const foodAdapter: SourceAdapter = {
  id: "food",
  description: "Food tips — Infatuation + Eater (+ FOUND SF)",
  async fetch() {
    const events: NormalizedEvent[] = [];
    const seen = new Set<string>();

    for (const config of FOOD_METRO_CONFIGS) {
      const tasks: Promise<NormalizedEvent[]>[] = [
        fetchEater(config),
        fetchInfatuation(config),
      ];
      if (config.found) {
        tasks.push(fetchFound(config.found.feedUrl));
      }

      for (const batch of await Promise.all(tasks)) {
        for (const ev of batch) {
          if (seen.has(ev.sourceEventId)) continue;
          seen.add(ev.sourceEventId);
          events.push(ev);
        }
      }
    }

    return { events, replaceForSource: "food" };
  },
};

async function fetchEater(config: FoodMetroConfig): Promise<NormalizedEvent[]> {
  try {
    const xml = await fetchText(config.eater.feedUrl);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const doc = parser.parse(xml);
    const entries = doc?.feed?.entry ?? [];
    const list = Array.isArray(entries) ? entries : [entries];
    const out: NormalizedEvent[] = [];

    for (const entry of list.slice(0, 25)) {
      const title = strip(
        String(entry.title?.["#text"] ?? entry.title ?? ""),
      ).trim();
      const link = String(
        entry.link?.["@_href"] ??
          (Array.isArray(entry.link)
            ? entry.link.find((l: { "@_rel"?: string }) => l["@_rel"] === "alternate")?.[
                "@_href"
              ]
            : "") ??
          "",
      ).trim();
      const summary = strip(
        String(entry.summary?.["#text"] ?? entry.summary ?? entry.content?.["#text"] ?? ""),
      );
      const published = parseDate(
        entry.published ?? entry.updated ?? null,
      );
      const cats = categoryTerms(entry);
      const imageUrl = firstImgSrc(
        String(entry.content?.["#text"] ?? entry.content ?? ""),
      );

      if (!title || !link) continue;
      if (!isEaterRecommendation(title, link, cats)) continue;
      if (isOutOfMetroEater(title, summary, config.metro)) continue;

      const id = contentHash(["eater", config.metro, link]);
      out.push({
        source: "food",
        sourceEventId: id,
        kind: "recommendation",
        title: title.slice(0, 180),
        description: summary.slice(0, 1500) || null,
        startsAt: suggestionStartsAt(id, published),
        city: cityFromText(`${title} ${summary}`, config.defaultCity),
        categories: ["food"],
        tags: ["food", config.eater.outletTag, ...cats.map(slugTag).filter(Boolean)],
        url: link,
        imageUrl,
        organizer: config.eater.organizer,
        venueName: venueFromTitle(title),
        neighborhood: neighborhoodFromText(`${title} ${summary}`, config.metro),
        rawPayload: { outlet: config.eater.outletTag, link, published },
      });
    }
    return out;
  } catch (err) {
    console.warn("[food] eater failed:", (err as Error).message);
    return [];
  }
}

async function fetchFound(feedUrl: string): Promise<NormalizedEvent[]> {
  try {
    const xml = await fetchText(feedUrl);
    const parser = new XMLParser({ ignoreAttributes: false });
    const doc = parser.parse(xml);
    const items = doc?.rss?.channel?.item ?? [];
    const list = Array.isArray(items) ? items : [items];
    const out: NormalizedEvent[] = [];

    for (const item of list.slice(0, 25)) {
      const proseTitle = strip(String(item.title ?? "")).trim();
      const link = String(item.link ?? item.guid ?? "").trim();
      // Substack puts the editorial subtitle in <description>; content:encoded is body.
      const subtitle = strip(String(item.description ?? "")).trim();
      const bodyHtml = String(item["content:encoded"] ?? "");
      const body = strip(bodyHtml);
      const published = parseDate(item.pubDate ?? null);
      const imageUrl =
        item.enclosure?.["@_url"] ?? firstImgSrc(bodyHtml) ?? null;

      if (!proseTitle || !link) continue;

      const parsed = parseFoundListing(proseTitle, subtitle, body);
      if (parsed.kind === "skip" || parsed.kind === "digest") continue;
      if (!isFoundFoodPost(proseTitle, `${subtitle} ${body}`, parsed)) continue;
      if (body.length < 40 && /subscribe|paid subscriber/i.test(body)) continue;

      const sectionHint =
        parsed.sectionHint ??
        extractFoundSectionHint(`${subtitle}\n${body}`);
      if (
        sectionHint &&
        FOUND_NON_FOOD_SECTIONS.has(sectionHint.sectionKey)
      ) {
        continue;
      }

      const placeName = parsed.placeName;
      const title = (placeName ?? parsed.guideTitle ?? proseTitle).slice(0, 180);
      const id = contentHash(["found", link]);
      const city =
        parsed.citySlug ??
        cityFromText(`${parsed.area ?? ""} ${placeName ?? ""} ${subtitle}`);
      const sectionKey = sectionHint?.sectionKey ?? null;
      const categories = categoriesForFoundSection(sectionKey);
      const sectionTag =
        sectionKey === "bars" || sectionKey === "nightlife"
          ? "bars"
          : sectionKey === "the nines"
            ? "nines"
            : null;

      out.push({
        source: "food",
        sourceEventId: id,
        kind: "recommendation",
        title,
        description: formatFoundDescription({
          proseTitle,
          subtitle,
          body,
          placeName,
          sectionHint,
        }),
        startsAt: suggestionStartsAt(id, published),
        city,
        categories,
        tags: [
          "food",
          "found_sf",
          ...(parsed.kind !== "prose" ? [parsed.kind] : []),
          ...(sectionTag ? [sectionTag] : []),
        ],
        url: link,
        imageUrl,
        organizer: "FOUND SF",
        venueName: placeName ?? null,
        neighborhood:
          parsed.area ??
          neighborhoodFromFoundTitle(proseTitle) ??
          neighborhoodFromText(placeName ?? "") ??
          neighborhoodFromText(subtitle),
        rawPayload: {
          outlet: "found_sf",
          link,
          published,
          proseTitle,
          subtitle,
          parseKind: parsed.kind,
          ...(sectionHint
            ? {
                section: sectionHint.section,
                sectionKey: sectionHint.sectionKey,
                series: sectionHint.series,
              }
            : {}),
        },
      });
    }
    return out;
  } catch (err) {
    console.warn("[food] found failed:", (err as Error).message);
    return [];
  }
}

async function fetchInfatuation(config: FoodMetroConfig): Promise<NormalizedEvent[]> {
  try {
    const html = await fetchText(config.infatuation.reviewsUrl);
    const listings = extractInfatuationListings(html).slice(0, 25);
    const out: NormalizedEvent[] = [];

    // Detail pages carry address, $–$$$$, full writeup, and byline.
    const details = await mapPool(listings, 4, async (r) => {
      const place = (r.placeName || r.documentTitleText || "").trim();
      if (!place || !r.slugName) return null;
      const path = (r.canonicalPathText || config.infatuation.canonicalPath).replace(
        /\/$/,
        "",
      );
      const url = `https://www.theinfatuation.com${path}/reviews/${r.slugName}`;
      try {
        const detailHtml = await fetchText(url);
        return {
          listing: r,
          url,
          place,
          detail: extractInfatuationDetail(detailHtml),
        };
      } catch (err) {
        console.warn(
          `[food] infatuation detail ${r.slugName}:`,
          (err as Error).message,
        );
        return { listing: r, url, place, detail: null };
      }
    });

    for (const row of details) {
      if (!row) continue;
      const { listing: r, url, place, detail } = row;
      const built = buildInfatuationEvent({
        listing: r,
        url,
        placeFallback: place,
        detail,
        defaultCity: config.defaultCity,
      });
      if (built) out.push(built);
    }
    return out;
  } catch (err) {
    console.warn(`[food] infatuation ${config.metro} failed:`, (err as Error).message);
    return [];
  }
}

/**
 * On-demand detail enrich for Infatuation URLs already in the DB
 * (older listing-only rows, or reviews no longer in the latest-25 scrape).
 */
export async function enrichInfatuationEvent(
  url: string,
): Promise<NormalizedEvent | null> {
  if (!/theinfatuation\.com\/[^/]+\/reviews\//i.test(url)) return null;
  try {
    const html = await fetchText(url);
    const detail = extractInfatuationDetail(html);
    if (!detail) return null;
    const slug =
      url.match(/\/reviews\/([^/?#]+)/i)?.[1]?.replace(/\/$/, "") ?? "";
    const place =
      detail.title || detail.venue?.name?.trim() || slug.replace(/-/g, " ");
    return buildInfatuationEvent({
      listing: {
        slugName: slug,
        placeName: place,
        documentTitleText: place,
      },
      url,
      placeFallback: place,
      detail,
      defaultCity: cityKeyFromLabel(
        url.match(/theinfatuation\.com\/([^/]+)\/reviews/i)?.[1],
      ),
    });
  } catch (err) {
    console.warn("[food] infatuation enrich failed:", (err as Error).message);
    return null;
  }
}

function buildInfatuationEvent(opts: {
  listing: InfatuationListing;
  url: string;
  placeFallback: string;
  detail: InfatuationDetail | null;
  defaultCity: string;
}): NormalizedEvent | null {
  const { listing: r, url, detail } = opts;
  const venue = detail?.venue ?? null;
  const place =
    (detail?.title || r.placeName || r.documentTitleText || opts.placeFallback)
      .trim();
  if (!place) return null;

  const neighborhood =
    detail?.neighborhood ??
    r.neighborhoods?.[0]?.neighborhoodDisplayName ??
    neighborhoodFromText(r.neighborhoods?.[0]?.neighborhoodName ?? "");
  const writeup = detail?.writeup?.trim() || "";
  const preview = strip(r.previewText ?? detail?.preview ?? "");
  const headline = detail?.headline?.trim() || null;
  const author = detail?.author?.trim() || null;
  const authorAvatarUrl = detail?.authorAvatarUrl ?? null;
  const published =
    detail?.published ??
    parseDate(r.publishedTimestamp ?? r.updateTimestamp ?? null);
  const rating =
    detail?.rating ??
    (typeof r.placeRatingNumber === "number" && r.placeRatingNumber > 0
      ? r.placeRatingNumber
      : null);
  // Infatuation venue.price is an ordinal $–$$$$ count (1–4), NOT USD.
  const dollarPrice =
    typeof venue?.price === "number" && venue.price >= 1 && venue.price <= 4
      ? Math.round(venue.price)
      : dollarPriceFromCode(r.placePriceIndicatorCode);
  const title = place;
  const imageUrl =
    detail?.imageUrl ??
    (r.postImage?.cloudinary?.imageIdentifier
      ? `https://res.cloudinary.com/the-infatuation/image/upload/c_fill,w_800,ar_4:3,g_center,f_auto/${r.postImage.cloudinary.imageIdentifier}`
      : null);
  const address = formatInfatuationAddress(venue);
  const description = formatInfatuationDescription({
    headline,
    writeup: writeup || preview,
    author,
    published,
  });
  const slug = r.slugName ?? "";
  const id = contentHash(["infatuation", opts.defaultCity, r.documentIdentifier || slug || place]);
  const cuisines = [
    ...(r.cuisines ?? [])
      .map((c) => c.cuisineName)
      .filter((n): n is string => Boolean(n)),
    ...(detail?.cuisines ?? []),
  ];

  return {
    source: "food",
    sourceEventId: id,
    kind: "recommendation",
    title: title.slice(0, 180),
    description: description.slice(0, 4000) || null,
    startsAt: suggestionStartsAt(id, published),
    city: cityKeyFromLabel(venue?.city) || opts.defaultCity,
    categories: ["food"],
    tags: [
      "food",
      "infatuation",
      ...(dollarPrice ? [`price_${"$".repeat(dollarPrice)}`] : []),
      ...cuisines.map(slugTag),
    ],
    url,
    imageUrl,
    organizer: author ? `${author} · Infatuation` : "The Infatuation",
    venueName: venue?.name?.trim() || place,
    address,
    neighborhood: neighborhood || null,
    lat: venue?.latlong?.lat ?? null,
    lng: venue?.latlong?.lon ?? null,
    // Store ordinal $ count in both min/max (UI renders as $$$$ not USD)
    priceMin: dollarPrice,
    priceMax: dollarPrice,
    rawPayload: {
      outlet: "infatuation",
      slug,
      rating,
      headline,
      preview: detail?.preview || preview || null,
      published: published?.toISOString() ?? null,
      author,
      authorAvatarUrl,
      dollarPrice,
      cuisines: [...new Set(cuisines)],
      venueUrl: venue?.url ?? null,
    },
  };
}

type InfatuationListing = {
  __typename?: string;
  documentIdentifier?: string;
  documentTitleText?: string;
  placeName?: string;
  slugName?: string;
  canonicalPathText?: string;
  previewText?: string;
  placeRatingNumber?: number;
  placePriceIndicatorCode?: string;
  publishedTimestamp?: string;
  updateTimestamp?: string;
  postImage?: { cloudinary?: { imageIdentifier?: string } };
  neighborhoods?: {
    neighborhoodDisplayName?: string;
    neighborhoodName?: string;
  }[];
  cuisines?: { cuisineName?: string }[];
};

type InfatuationVenue = {
  name?: string;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  price?: number | null;
  url?: string | null;
  latlong?: { lat?: number; lon?: number } | null;
};

type InfatuationDetail = {
  title: string | null;
  headline: string | null;
  writeup: string;
  preview: string;
  author: string | null;
  authorAvatarUrl: string | null;
  published: Date | null;
  rating: number | null;
  neighborhood: string | null;
  imageUrl: string | null;
  cuisines: string[];
  venue: InfatuationVenue | null;
};

function extractInfatuationListings(html: string): InfatuationListing[] {
  const data = parseNextData(html);
  if (!data) return [];

  const out: InfatuationListing[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    const obj = node as InfatuationListing;
    if (
      obj.__typename === "PostReview" &&
      (obj.slugName || obj.documentIdentifier)
    ) {
      const key = obj.documentIdentifier || obj.slugName!;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(obj);
      }
    }
    for (const v of Object.values(obj)) walk(v);
  };

  walk(data.props?.pageProps?.initialQueryState);
  return out;
}

function extractInfatuationDetail(html: string): InfatuationDetail | null {
  const data = parseNextData(html);
  const state = data?.props?.pageProps?.initialApolloState;
  if (!state || typeof state !== "object") return null;

  const review = Object.values(state).find(
    (v) =>
      v &&
      typeof v === "object" &&
      (v as { __typename?: string }).__typename === "PostReview" &&
      "content" in (v as object),
  ) as Record<string, unknown> | undefined;
  if (!review) return null;

  const venue = (review.venue as InfatuationVenue | null) ?? null;
  const writeup = richTextToPlain(
    (review.content as { json?: unknown } | null)?.json,
  ).trim();
  const contributorRef = (
    review['contributorCollection({"limit":5})'] as
      | { items?: { __ref?: string }[] }
      | undefined
  )?.items?.[0]?.__ref;
  const author = resolveApolloName(state, contributorRef);
  const authorAvatarUrl = resolveApolloAvatar(state, contributorRef);
  const neighborhood = resolveApolloName(
    state,
    (
      review['neighborhoodTagsCollection({"limit":2})'] as
        | { items?: { __ref?: string }[] }
        | undefined
    )?.items?.[0]?.__ref,
    "displayName",
  );
  const cuisineRefs =
    (
      review['cuisineTagsCollection({"limit":2})'] as
        | { items?: { __ref?: string }[] }
        | undefined
    )?.items ?? [];
  const cuisines = cuisineRefs
    .map((item) => resolveApolloName(state, item.__ref, "name"))
    .filter((n): n is string => Boolean(n));

  const gallery = review.headerGallery as
    | { assets?: { secure_url?: string; public_id?: string }[] }
    | null;
  const asset = gallery?.assets?.[0];
  const imageUrl = asset?.secure_url
    ? asset.secure_url.replace(/^http:/, "https:")
    : asset?.public_id
      ? `https://res.cloudinary.com/the-infatuation/image/upload/c_fill,w_800,ar_4:3,g_center,f_auto/${asset.public_id}`
      : null;

  const ratingRaw = review.rating;
  const rating =
    typeof ratingRaw === "number" && ratingRaw > 0 ? ratingRaw : null;

  return {
    title: String(review.title ?? "").trim() || null,
    headline: String(review.headline ?? "").trim() || null,
    writeup,
    preview: String(review.preview ?? "").trim(),
    author,
    authorAvatarUrl,
    published: parseDate(review.publishDate ?? null),
    rating,
    neighborhood,
    imageUrl,
    cuisines,
    venue,
  };
}

function parseNextData(html: string): {
  props?: {
    pageProps?: {
      initialQueryState?: unknown;
      initialApolloState?: Record<string, unknown>;
    };
  };
} | null {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function resolveApolloAvatar(
  state: Record<string, unknown>,
  ref: string | undefined,
): string | null {
  if (!ref) return null;
  const node = state[ref] as
    | {
        avatarV2?: { secure_url?: string; url?: string; public_id?: string }[];
      }
    | undefined;
  const avatar = node?.avatarV2?.[0];
  if (!avatar) return null;
  if (avatar.secure_url) return avatar.secure_url.replace(/^http:/, "https:");
  if (avatar.url) return String(avatar.url).replace(/^http:/, "https:");
  if (avatar.public_id) {
    return `https://res.cloudinary.com/the-infatuation/image/upload/c_fill,w_96,h_96,g_face,f_auto,q_auto/${avatar.public_id}`;
  }
  return null;
}

function resolveApolloName(
  state: Record<string, unknown>,
  ref: string | undefined,
  field: "name" | "displayName" = "name",
): string | null {
  if (!ref) return null;
  const node = state[ref] as Record<string, unknown> | undefined;
  if (!node) return null;
  const display = node.displayName ?? node.neighborhoodDisplayName;
  const name = node.name ?? node.contributorName;
  const raw =
    field === "displayName"
      ? (display ?? name)
      : (name ?? display);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function richTextToPlain(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(richTextToPlain).join("");
  const n = node as {
    nodeType?: string;
    value?: string;
    content?: unknown[];
  };
  if (n.nodeType === "text") return n.value ?? "";
  const inner = (n.content ?? []).map(richTextToPlain).join("");
  if (n.nodeType === "paragraph" || n.nodeType === "heading-2") {
    return `${inner}\n\n`;
  }
  return inner;
}

function formatInfatuationAddress(venue: InfatuationVenue | null): string | null {
  if (!venue?.street) return null;
  const cityState = [venue.city, venue.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, venue.postalCode?.trim()]
    .filter(Boolean)
    .join(" ");
  return [venue.street.trim(), cityStateZip].filter(Boolean).join(", ") || null;
}

function formatInfatuationDescription(opts: {
  headline?: string | null;
  writeup: string;
  author: string | null;
  published: Date | null;
}): string {
  const parts: string[] = [];
  if (opts.headline?.trim()) parts.push(opts.headline.trim());
  const body = opts.writeup.trim();
  if (body) parts.push(body);
  const when = opts.published
    ? opts.published.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const byline = [opts.author, when].filter(Boolean).join(" · ");
  if (byline) parts.push(`— ${byline}`);
  return parts.join("\n\n");
}

/** Map Infatuation venue.price (1–4) or listing price code → $ count */
function dollarPriceFromCode(code?: string): number | null {
  switch (code) {
    case "INEXPENSIVE":
      return 1;
    case "MODERATE":
      return 2;
    case "MODERATELY_EXPENSIVE":
      return 3;
    case "EXPENSIVE":
    case "VERY_EXPENSIVE":
      return 4;
    default:
      return null;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

function isOutOfMetroEater(
  title: string,
  summary: string,
  metro: FoodMetroConfig["metro"],
): boolean {
  if (metro !== "chicago") return false;
  const text = `${title} ${summary}`.toLowerCase();
  // Eater CHI publishes occasional travel guides for nearby states / college towns.
  if (
    /\b(indiana|wisconsin|michigan|iowa|missouri|kentucky|south bend|notre dame)\b/i.test(
      text,
    ) &&
    !/\b(chicago|evanston|oak park|wicker park|logan square|hyde park|pilsen)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

function isEaterRecommendation(
  title: string,
  link: string,
  cats: string[],
): boolean {
  const t = title.toLowerCase();
  const href = link.toLowerCase();
  const cat = cats.join(" ").toLowerCase();

  if (/\/restaurant-closings?\b|closings?\b/.test(href) || /set to close|closes the door|shutting down/i.test(t)) {
    return false;
  }
  if (/crowdfunder|fundraising|lawsuit|union|layoff/i.test(t)) return false;

  if (
    /\/maps\//.test(href) ||
    /\/dining-report\//.test(href) ||
    /best (new )?restaurants|essential \d+|hit list|where to eat|best dishes/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/dining reports|dining out|openings|maps/i.test(cat)) return true;
  if (/\/restaurant-news\//.test(href) && /opening|opens|debut/i.test(t)) {
    return true;
  }
  return false;
}

function isFoundFoodPost(
  title: string,
  body: string,
  parsed?: FoundListingParse,
): boolean {
  if (parsed?.kind === "nines") return true;
  if (parsed?.kind === "place" || parsed?.kind === "profile") {
    // Structured food/drink venue — trust even if body is paywalled short.
    return true;
  }
  const text = `${title} ${body.slice(0, 500)}`.toLowerCase();
  if (
    /\b(restaurant|restaurants|dining|brunch|dinner|lunch|cafe|bakery|bar|cocktail|wine|eat|food|taco|pizza|sushi|omakase|found 45|the nines)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/^restaurants?\b/i.test(title) || /found\s*45/i.test(title)) return true;
  return false;
}

/**
 * FOUND Substack patterns (from RSS subtitle / <description>):
 * - Single spot: "Pretty Things (Albany)" — place + geo in subtitle; title is punny prose
 * - Profile: "SHEKOH MOOSSAVI • Shekoh Confections…" — ALL-CAPS person • business
 * - Section hint in body: "BARS • First Round", "WORK • Wednesday Routine"
 * - Nines: title "Dining, West Portal" + subtitle "RESTAURANTS • The Nines"
 * - Digest: "A, B, C, MORE" — skip (not one place)
 * Parenthetical without a known geo ("Headscarf (Hunza G)") is treated as non-place.
 */
type FoundListingParse = {
  kind: "place" | "profile" | "nines" | "digest" | "prose" | "skip";
  placeName?: string;
  area?: string;
  citySlug?: string;
  guideTitle?: string;
  sectionHint?: ReturnType<typeof extractFoundSectionHint>;
};

const FOUND_SECTION_LABELS = new Set([
  "restaurants",
  "getaways",
  "real estate",
  "work",
  "goods & services",
  "goods and services",
  "bars",
  "nightlife",
  "shopping",
  "on the market",
  "the nines",
  "found object",
  "first round",
  "friday routine",
]);

/** Places FOUND uses in "Name (Place)" subtitles — geo gate avoids brand false positives. */
const FOUND_GEO: { re: RegExp; label: string; citySlug: string }[] = [
  { re: /^albany$/i, label: "Albany", citySlug: "albany" },
  { re: /^berkeley$/i, label: "Berkeley", citySlug: "berkeley" },
  { re: /^oakland$/i, label: "Oakland", citySlug: "oakland" },
  { re: /^(san francisco|sf)$/i, label: "San Francisco", citySlug: "sf" },
  { re: /^santa cruz$/i, label: "Santa Cruz", citySlug: "santa_cruz" },
  { re: /^coronado$/i, label: "Coronado", citySlug: "coronado" },
  { re: /^healdsburg$/i, label: "Healdsburg", citySlug: "healdsburg" },
  { re: /^sonoma$/i, label: "Sonoma", citySlug: "sonoma" },
  { re: /^napa$/i, label: "Napa", citySlug: "napa" },
  { re: /^marin$/i, label: "Marin", citySlug: "marin" },
  { re: /^palo alto$/i, label: "Palo Alto", citySlug: "palo_alto" },
  { re: /^mill valley$/i, label: "Mill Valley", citySlug: "mill_valley" },
  { re: /^sausalito$/i, label: "Sausalito", citySlug: "sausalito" },
  { re: /^walnut creek$/i, label: "Walnut Creek", citySlug: "walnut_creek" },
  { re: /^emeryville$/i, label: "Emeryville", citySlug: "emeryville" },
  { re: /^alameda$/i, label: "Alameda", citySlug: "alameda" },
  { re: /^richmond$/i, label: "Richmond", citySlug: "richmond" },
  { re: /^dale city$|^daly city$/i, label: "Daly City", citySlug: "daly_city" },
  // SF neighborhoods often appear as the parenthetical
  { re: /^mission$/i, label: "Mission", citySlug: "sf" },
  { re: /^marina$/i, label: "Marina", citySlug: "sf" },
  { re: /^soma$/i, label: "SoMa", citySlug: "sf" },
  { re: /^north beach$/i, label: "North Beach", citySlug: "sf" },
  { re: /^hayes valley$/i, label: "Hayes Valley", citySlug: "sf" },
  { re: /^haight$|^upper haight$/i, label: "Haight", citySlug: "sf" },
  { re: /^castro$/i, label: "Castro", citySlug: "sf" },
  { re: /^nob hill$/i, label: "Nob Hill", citySlug: "sf" },
  { re: /^pacific heights$|^pac heights$/i, label: "Pacific Heights", citySlug: "sf" },
  { re: /^sunset$/i, label: "Sunset", citySlug: "sf" },
  { re: /^richmond$|^inner richmond$|^outer richmond$/i, label: "Richmond", citySlug: "sf" },
  { re: /^bernal heights$|^bernal$/i, label: "Bernal Heights", citySlug: "sf" },
  { re: /^bayview$/i, label: "Bayview", citySlug: "sf" },
  { re: /^cole valley$/i, label: "Cole Valley", citySlug: "sf" },
  { re: /^west portal$/i, label: "West Portal", citySlug: "sf" },
  { re: /^fidi$|^financial district$/i, label: "Financial District", citySlug: "sf" },
  { re: /^chinatown$/i, label: "Chinatown", citySlug: "sf" },
  { re: /^nopa$/i, label: "NoPa", citySlug: "sf" },
];

function matchFoundGeo(
  raw: string,
): { label: string; citySlug: string } | null {
  const t = raw.trim();
  for (const g of FOUND_GEO) {
    if (g.re.test(t)) return { label: g.label, citySlug: g.citySlug };
  }
  return null;
}

function parseFoundListing(
  title: string,
  subtitle: string,
  body: string,
): FoundListingParse {
  const sub = subtitle.replace(/\s+/g, " ").trim();
  const t = title.replace(/\s+/g, " ").trim();
  const sectionHint = extractFoundSectionHint(`${sub}\n${body}`);

  // Weekly digests / multi-hit roundups — not a single venue card
  if (
    /, MORE\b/i.test(sub) ||
    (sub.split(",").length >= 4 && !/^.+\([^)]+\)\s*$/.test(sub))
  ) {
    return { kind: "digest", sectionHint };
  }

  // Non-food sections in subtitle or FOUND section line
  if (
    /^(real estate|shopping|goods\s*&\s*services)\b/i.test(sub) ||
    /\bon the market\b/i.test(sub) ||
    (sectionHint && FOUND_NON_FOOD_SECTIONS.has(sectionHint.sectionKey))
  ) {
    return { kind: "skip", sectionHint };
  }

  // The Nines area guides: "Dining, West Portal"
  const ninesTitle = t.match(
    /^(dining|restaurants?|brunch|bars?)\s*,\s*(.+)$/i,
  );
  if (ninesTitle || /\bthe nines\b/i.test(sub)) {
    const area = (ninesTitle?.[2] ?? "").trim() || undefined;
    return {
      kind: "nines",
      guideTitle: t,
      area: area
        ? neighborhoodFromText(area) ?? area
        : neighborhoodFromFoundTitle(t) ?? undefined,
      citySlug: "sf",
      sectionHint: sectionHint ?? {
        sectionKey: "the nines",
        section: "The Nines",
        series: "The Nines",
      },
    };
  }

  // "Pretty Things (Albany)" — only when parenthetical is a known geo
  const placeCity = sub.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (placeCity) {
    const place = placeCity[1]!.trim();
    const geo = matchFoundGeo(placeCity[2]!);
    if (place && geo) {
      return {
        kind: "place",
        placeName: place,
        area: geo.label,
        citySlug: geo.citySlug,
        sectionHint,
      };
    }
  }

  // "SHEKOH MOOSSAVI • Shekoh Confections & …" / "KEVIN ELMORE • Food Folk"
  const personBiz = sub.match(/^([A-Z][A-Z0-9\s.'’\-]{1,40})\s*[•·]\s*(.+)$/);
  if (personBiz) {
    const person = personBiz[1]!.trim();
    const biz = personBiz[2]!.trim();
    if (!FOUND_SECTION_LABELS.has(person.toLowerCase()) && biz.length >= 2) {
      // Require mostly caps person token (FOUND profile convention)
      const letters = person.replace(/[^A-Za-z]/g, "");
      const caps = person.replace(/[^A-Z]/g, "");
      if (letters.length >= 4 && caps.length / letters.length >= 0.7) {
        return {
          kind: "profile",
          placeName: biz.split(/[•·]/)[0]!.trim(),
          sectionHint,
        };
      }
    }
  }

  // "TESS ROLETTI, Fussie"
  const personComma = sub.match(/^([A-Z][A-Z\s.'’\-]{2,40}),\s*([^,]+)$/);
  if (personComma) {
    const person = personComma[1]!.trim();
    const biz = personComma[2]!.trim();
    const letters = person.replace(/[^A-Za-z]/g, "");
    const caps = person.replace(/[^A-Z]/g, "");
    if (
      letters.length >= 4 &&
      caps.length / letters.length >= 0.7 &&
      !FOUND_SECTION_LABELS.has(biz.toLowerCase())
    ) {
      return { kind: "profile", placeName: biz, sectionHint };
    }
  }

  // Fallback: bold venue in "opening **Pretty Things**," skinny blurb
  const bold = body.match(
    /\b(?:opening|opened|at|of)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,5})\b/,
  );
  if (bold?.[1] && bold[1].length >= 3 && bold[1].length <= 48) {
    // Only use if subtitle was empty/useless — avoid over-eager body scrape
    if (!sub || sub.length > 80) {
      return { kind: "place", placeName: bold[1], sectionHint };
    }
  }

  return { kind: "prose", sectionHint };
}

function formatFoundDescription(opts: {
  proseTitle: string;
  subtitle: string;
  body: string;
  placeName?: string;
  sectionHint?: ReturnType<typeof extractFoundSectionHint>;
}): string {
  const parts: string[] = [];
  // Keep punny headline as context when card title is the venue
  if (opts.placeName && opts.proseTitle && opts.proseTitle !== opts.placeName) {
    parts.push(`FOUND: ${opts.proseTitle}`);
  }
  if (opts.sectionHint) {
    parts.push(`${opts.sectionHint.section} · ${opts.sectionHint.series}`);
  }
  const blurb = opts.body.slice(0, 1400).trim();
  if (blurb) parts.push(blurb);
  else if (opts.subtitle) parts.push(opts.subtitle);
  return parts.join("\n\n").slice(0, 1500);
}

function categoryTerms(entry: {
  category?:
    | { "@_term"?: string; term?: string }
    | { "@_term"?: string; term?: string }[];
}): string[] {
  const raw = entry.category;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((c) => String(c["@_term"] ?? c.term ?? "").trim())
    .filter(Boolean);
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function strip(html: string) {
  return stripHtmlToText(html);
}

function firstImgSrc(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m?.[1]) return null;
  return decodeHtmlEntities(m[1]);
}

function slugTag(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function venueFromTitle(title: string): string | null {
  // "… at This Impressive Thai Restaurant" — skip; prefer place-named titles
  const at = title.match(/\bat\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,4})\s*$/);
  if (at?.[1] && at[1].split(/\s+/).length <= 5) return at[1];
  return null;
}

const SF_NEIGHBORHOODS: { re: RegExp; name: string }[] = [
  { re: /\bmission\b/i, name: "Mission" },
  { re: /\bsoma\b|south of market/i, name: "SoMa" },
  { re: /\bnorth beach\b/i, name: "North Beach" },
  { re: /\brichmond\b/i, name: "Richmond" },
  { re: /\bsunset\b/i, name: "Sunset" },
  { re: /\bhaight\b/i, name: "Haight" },
  { re: /\bhayes valley\b/i, name: "Hayes Valley" },
  { re: /\bmarina\b/i, name: "Marina" },
  { re: /\bembarcadero\b|ferry building/i, name: "Embarcadero" },
  { re: /\bchinatown\b/i, name: "Chinatown" },
  { re: /\bjapan\s*town\b/i, name: "Japantown" },
  { re: /\bdogpatch\b/i, name: "Dogpatch" },
  { re: /\bpotrero\b/i, name: "Potrero Hill" },
  { re: /\bcastro\b/i, name: "Castro" },
  { re: /\bnopa\b|north of the panhandle/i, name: "NoPa" },
  { re: /\btenderloin\b/i, name: "Tenderloin" },
  { re: /\bfidi\b|financial district/i, name: "Financial District" },
  { re: /\boakland\b/i, name: "Oakland" },
  { re: /\bberkeley\b/i, name: "Berkeley" },
];

const CHI_NEIGHBORHOODS: { re: RegExp; name: string }[] = [
  { re: /\bwicker park\b/i, name: "Wicker Park" },
  { re: /\blogan square\b/i, name: "Logan Square" },
  { re: /\blincoln park\b/i, name: "Lincoln Park" },
  { re: /\blakeview\b/i, name: "Lakeview" },
  { re: /\briver north\b/i, name: "River North" },
  { re: /\bwest loop\b/i, name: "West Loop" },
  { re: /\bfulton market\b/i, name: "Fulton Market" },
  { re: /\bhyde park\b/i, name: "Hyde Park" },
  { re: /\bpilsen\b/i, name: "Pilsen" },
  { re: /\bbridgeport\b/i, name: "Bridgeport" },
  { re: /\bchinatown\b/i, name: "Chinatown" },
  { re: /\bandersonville\b/i, name: "Andersonville" },
  { re: /\bwrigleyville\b/i, name: "Wrigleyville" },
  { re: /\buptown\b/i, name: "Uptown" },
  { re: /\bbucktown\b/i, name: "Bucktown" },
  { re: /\bgold coast\b/i, name: "Gold Coast" },
  { re: /\bstreeterville\b/i, name: "Streeterville" },
  { re: /\bsouth loop\b/i, name: "South Loop" },
  { re: /\bloop\b|downtown chicago/i, name: "The Loop" },
  { re: /\bevanston\b/i, name: "Evanston" },
  { re: /\boak park\b/i, name: "Oak Park" },
];

function neighborhoodFromText(
  text: string,
  metro: FoodMetroConfig["metro"] = "sf",
): string | null {
  const list = metro === "chicago" ? CHI_NEIGHBORHOODS : SF_NEIGHBORHOODS;
  for (const n of list) {
    if (n.re.test(text)) return n.name;
  }
  return null;
}

/** FOUND titles like "Dining, Upper Haight" / "Restaurants, West Portal" */
function neighborhoodFromFoundTitle(title: string): string | null {
  const m = title.match(
    /^(?:dining|restaurants?|brunch|bars?)\s*,\s*(.+)$/i,
  );
  if (!m?.[1]) return null;
  const place = m[1].trim();
  return neighborhoodFromText(place) ?? place.slice(0, 60);
}

function cityFromText(text: string, defaultCity = "sf"): string {
  if (/\bchicago\b|\bchi-town\b|\bchi town\b/i.test(text)) return "chicago";
  if (/\bevanston\b/i.test(text)) return "evanston";
  if (/\boak park\b/i.test(text)) return "oak_park";
  if (/\balbany\b/i.test(text)) return "albany";
  if (/\boakland\b/i.test(text)) return "oakland";
  if (/\bberkeley\b/i.test(text)) return "berkeley";
  if (/\bsanta cruz\b/i.test(text)) return "santa_cruz";
  if (/\bhealdsburg\b/i.test(text)) return "healdsburg";
  if (/\bsonoma\b|napa\b|marin\b/i.test(text)) return "sf";
  return defaultCity;
}
