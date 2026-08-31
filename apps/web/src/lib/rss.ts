import type { FeedCard, FeedCity, FeedTopic } from "@bored/shared";
import { cityShareLabel } from "@/lib/city-share";
import { cardDetailUrl } from "@/lib/topic-seo";
import { siteUrl } from "@/lib/site";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

export function buildEventsRss(opts: {
  city: FeedCity;
  topic?: FeedTopic;
  cards: FeedCard[];
  title: string;
  description: string;
  selfPath: string;
}): string {
  const base = siteUrl();
  const channelLink = opts.topic
    ? `${base}/${opts.city}/${opts.topic}`
    : `${base}/${opts.city}`;
  const selfUrl = `${base}${opts.selfPath}`;
  const cityLabel = cityShareLabel(opts.city);
  const items = opts.cards.slice(0, 50).map((card) => {
    const link = cardDetailUrl(card);
    const descParts = [
      card.subtitle,
      card.venueName,
      card.neighborhood,
      card.isFree ? "Free" : null,
    ].filter(Boolean);
    const description =
      descParts.join(" · ") || `Upcoming listing in ${cityLabel}`;

    return [
      "<item>",
      `<title>${xmlEscape(card.title)}</title>`,
      `<link>${xmlEscape(link)}</link>`,
      `<guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `<pubDate>${rfc822(card.startsAt)}</pubDate>`,
      `<description>${xmlEscape(description)}</description>`,
      "</item>",
    ].join("");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `<channel>`,
    `<title>${xmlEscape(opts.title)}</title>`,
    `<link>${xmlEscape(channelLink)}</link>`,
    `<description>${xmlEscape(opts.description)}</description>`,
    `<language>en-us</language>`,
    `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `<atom:link href="${xmlEscape(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    `</channel>`,
    `</rss>`,
  ].join("");
}

export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
