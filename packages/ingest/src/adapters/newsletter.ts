import { XMLParser } from "fast-xml-parser";
import {
  contentHash,
  fetchText,
  parsePrice,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

/**
 * Phase 2: newsletter / blog RSS → lightweight event extraction.
 * Uses heuristics (no LLM required for v1 pipeline).
 *
 * Important: Substack / blog posts are usually roundups, guides, or paywalled digests —
 * not a single dated event. Only emit when the item looks like one happening with a
 * parseable start; never invent “next weekend 7pm”.
 */
const FEEDS = [
  {
    id: "brokeassstuart",
    url: "https://brokeassstuart.com/feed/",
    categories: ["nightlife", "arts"],
  },
  {
    id: "eddieslist",
    url: "https://www.eddies-list.com/feed",
    categories: ["arts"],
  },
];

export const newsletterAdapter: SourceAdapter = {
  id: "newsletter",
  description: "SF event newsletters/blogs via RSS extraction",
  async fetch() {
    const events: NormalizedEvent[] = [];
    const parser = new XMLParser({ ignoreAttributes: false });

    for (const feed of FEEDS) {
      try {
        const xml = await fetchText(feed.url);
        const doc = parser.parse(xml);
        const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
        const list = Array.isArray(items) ? items : [items];

        for (const item of list.slice(0, 20)) {
          const title = String(item.title?.["#text"] ?? item.title ?? "").trim();
          const link = String(
            item.link?.["@_href"] ?? item.link ?? item.id ?? "",
          ).trim();
          const description = strip(
            String(item["content:encoded"] ?? item.description ?? item.summary ?? item.content ?? ""),
          );
          if (!title || !link) continue;
          if (isCuratedArticleNotEvent(title, link, description)) continue;

          const extracted = extractEventsFromProse(title, description, link, feed);
          events.push(...extracted);
        }
      } catch (err) {
        console.warn(`[newsletter] ${feed.id} failed:`, (err as Error).message);
      }
    }

    return { events };
  },
};

function strip(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Weekly digests, evergreen guides, city “things to do” hubs, and similar posts
 * are articles (often paywalled on Substack) — not one feedable event.
 */
function isCuratedArticleNotEvent(title: string, link: string, body: string): boolean {
  const slug = link.toLowerCase();
  const t = title.toLowerCase();
  const text = `${t} ${body.slice(0, 400).toLowerCase()}`;

  // Eddie's List weekly paid roundups: .../p/san-francisco-bay-area-events-this-week-20260817
  if (/events-this-week|events-this-weekend|things-to-do-this-week/i.test(slug)) {
    return true;
  }
  if (
    /\b(events?|news|shows?).{0,40}this week\b/i.test(t) ||
    /\bthings to do this (week|weekend)\b/i.test(t) ||
    /\bthis weekend\b.{0,40}\b(events?|festivals?|things to do)\b/i.test(t) ||
    /\b(events?|festivals?).{0,40}\bthis weekend\b/i.test(t)
  ) {
    return true;
  }

  // Monthly / seasonal mega-lists and recommendation hubs
  if (
    /events-(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}/i.test(
      slug,
    ) ||
    /\bevents?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(
      t,
    ) ||
    /labor-day-weekend-events|tech-week-event|event-recommendations/i.test(slug) ||
    /\b(event recommendations|early picks|unofficial faqs?)\b/i.test(t)
  ) {
    return true;
  }

  // Evergreen guides / venue directories (not a single outing)
  if (
    /\bevents?\s*&\s*classes\b/i.test(t) ||
    /\bevents?,?\s*(clubs?|classes?).{0,20}(pop-ups?|&)/i.test(t) ||
    /\b(last updated:|sign up below|keep up on last-minute)\b/i.test(text) ||
    /\/p\/(salsa-dancing|directory|about)\b/i.test(slug) ||
    /\b(how to|where to|insider advice|first-timer|etiquette|guide|grants?|data centers?|311 services|dating apps|facial scanning|smart glasses|pay what you can day)\b/i.test(
      t,
    ) ||
    /\b(is taking over|banning|complaints)\b/i.test(t) ||
    /\blocations?,?\s+dates?\s*&?\s*times?\b/i.test(t) ||
    /\b(trivia nights?|coworking spaces?|street art).{0,40}\b(locations?|dates?|times?|tours?)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  // Soft paywall / subscriber teaser copy in the RSS excerpt
  if (
    /\b(paid subscribers? only|for paid subscribers|subscribe to (read|unlock)|already a paid subscriber)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

function extractEventsFromProse(
  title: string,
  body: string,
  link: string,
  feed: { id: string; categories: string[] },
): NormalizedEvent[] {
  const startsAt = guessDate(title);
  // No invented fallback dates — a blog post without a concrete when is not an event.
  if (!startsAt) return [];

  const { priceMin, priceMax, isFree } = parsePrice(`${title} ${body.slice(0, 500)}`);
  const categories = [...feed.categories];
  if (/comedy|standup|stand-up/i.test(title)) categories.push("comedy.showcase");
  if (/techno|house|dj|rave/i.test(title)) categories.push("music.electronic");
  if (/concert|band|live music/i.test(title)) categories.push("music.live");
  if (/film|movie|screening/i.test(title)) categories.push("movies");

  return [
    {
      source: "newsletter",
      sourceEventId: contentHash([feed.id, link, title]),
      title: title.slice(0, 180),
      description: body.slice(0, 1500),
      startsAt,
      city: "sf",
      priceMin,
      priceMax,
      isFree,
      categories: [...new Set(categories)],
      tags: ["newsletter", feed.id],
      url: link,
      organizer: feed.id,
      rawPayload: { feed: feed.id, title },
    },
  ];
}

function guessDate(text: string): Date | null {
  const m = text.match(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
  );
  if (m) {
    const want = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ].indexOf(m[1]!.toLowerCase());
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const t = new Date();
      t.setDate(t.getDate() + i);
      t.setHours(19, 0, 0, 0);
      if (t.getDay() === want) return t;
    }
  }
  return null;
}
