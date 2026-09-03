import type { Metadata } from "next";
import type { FeedCard, FeedCity, FeedTopic } from "@bored/shared";
import {
  FEED_TOPICS,
  FEED_TOPIC_LABELS,
  defaultAreaForCity,
  isFeedTopic,
} from "@bored/shared";
import { cityShareLabel } from "@/lib/city-share";
import { siteUrl } from "@/lib/site";

/** Minimum upcoming cards before a topic hub is indexable. */
export const MIN_INDEXABLE_EVENTS = 3;

export { isFeedTopic };

export function topicHubPath(city: FeedCity, topic: FeedTopic): string {
  return `/${city}/${topic}`;
}

export function topicHubUrl(city: FeedCity, topic: FeedTopic): string {
  return `${siteUrl()}${topicHubPath(city, topic)}`;
}

export function topicHubTitle(city: FeedCity, topic: FeedTopic): string {
  const cityLabel = cityShareLabel(city);
  return `${FEED_TOPIC_LABELS[topic]} in ${cityLabel}`;
}

function topicHubIntro(city: FeedCity, topic: FeedTopic): string {
  const cityLabel = cityShareLabel(city);
  const topicLabel = FEED_TOPIC_LABELS[topic].toLowerCase();

  const intros: Record<FeedTopic, string> = {
    concerts: `Upcoming live music, DJ sets, and concerts in ${cityLabel} — aggregated from local calendars and ticket platforms.`,
    music_festivals: `Music festivals, multi-day concert weekends, and ticketed fest lineups in ${cityLabel}.`,
    comedy: `Stand-up, showcases, open mics, and comedy clubs in ${cityLabel} — club headliners plus recurring rooms.`,
    movies: `Movies playing in ${cityLabel} with showtimes, ratings, and ticket links.`,
    sports: `Games and sports events in ${cityLabel}.`,
    festivals: `Street festivals, block parties, night markets, and fairs in ${cityLabel}.`,
    free: `Free and cheap things to do in ${cityLabel} — no-cover shows, free museum days, and budget picks.`,
    happy_hours: `Happy hours and drink specials in ${cityLabel}.`,
    food: `Restaurant tips, new openings, and where to eat in ${cityLabel}.`,
    nightlife: `Bars, clubs, and late-night events in ${cityLabel}.`,
    arts: `Arts, culture, museums, and gallery events in ${cityLabel}.`,
    theater: `Broadway tours, musicals, plays, and live stage in ${cityLabel} — flagship houses plus touring hits.`,
    activities: `Evergreen things to do in ${cityLabel} — parks, hikes, neighborhoods, and local gems.`,
  };

  return (
    intros[topic] ??
    `Upcoming ${topicLabel} in ${cityLabel} — refreshed from local event sources.`
  );
}

export function topicHubMetadata(
  city: FeedCity,
  topic: FeedTopic,
  cardCount: number,
): Metadata {
  const title = `${topicHubTitle(city, topic)} — Bored`;
  const description = topicHubIntro(city, topic);
  const canonical = topicHubUrl(city, topic);
  const indexable = cardCount >= MIN_INDEXABLE_EVENTS;

  return {
    title,
    description,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": `${siteUrl()}/feed/${city}/${topic}`,
      },
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Bored",
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function topicHubArea(city: FeedCity): string {
  return defaultAreaForCity(city);
}

export function cardDetailPath(card: FeedCard): string {
  if (card.kind === "movie_showtime" && card.filmId) {
    return `/movies/${card.filmId}`;
  }
  return `/events/${card.id}`;
}

export function cardDetailUrl(card: FeedCard): string {
  return `${siteUrl()}${cardDetailPath(card)}`;
}

/** All city × topic pairs for sitemap / llms.txt. */
export function allTopicHubPaths(): Array<{ city: FeedCity; topic: FeedTopic }> {
  const cities = ["sf", "chicago", "la"] as const satisfies readonly FeedCity[];
  const out: Array<{ city: FeedCity; topic: FeedTopic }> = [];
  for (const city of cities) {
    for (const topic of FEED_TOPICS) {
      out.push({ city, topic });
    }
  }
  return out;
}

export function topicHubIntroText(city: FeedCity, topic: FeedTopic): string {
  return topicHubIntro(city, topic);
}

export type TopicHubFaq = { question: string; answer: string };

/** Answer-first FAQs for AEO / FAQPage schema on topic hubs. */
export function topicHubFaqs(
  city: FeedCity,
  topic: FeedTopic,
  cardCount: number,
): TopicHubFaq[] {
  const cityLabel = cityShareLabel(city);
  const topicLabel = FEED_TOPIC_LABELS[topic];
  const topicLower = topicLabel.toLowerCase();
  const countPhrase =
    cardCount > 0
      ? `Right now Bored lists ${cardCount} upcoming ${topicLower} listing${cardCount === 1 ? "" : "s"} in ${cityLabel}.`
      : `Bored does not currently have upcoming ${topicLower} listings for ${cityLabel}; check back soon.`;

  return [
    {
      question: `What ${topicLower} are happening in ${cityLabel}?`,
      answer: `${countPhrase} Open ${topicHubUrl(city, topic)} for dates, venues, and links to each listing.`,
    },
    {
      question: `How does Bored find ${topicLower} in ${cityLabel}?`,
      answer: `Bored aggregates ${topicLower} from local calendars, ticket platforms, and editorial sources, then ranks them for discovery. Listings refresh throughout the day as sources update.`,
    },
    {
      question: `Is Bored free to use for ${topicLower} in ${cityLabel}?`,
      answer: `Yes. Browsing ${topicLower} on Bored is free. Some events sell tickets through third-party sites; Bored links out and does not charge a booking fee.`,
    },
    {
      question: `Where else can I browse things to do in ${cityLabel}?`,
      answer: `Start at ${siteUrl()}/${city} for the full feed, or use topic pages like concerts, comedy, free events, food, and activities. Free-text search redirects via ${siteUrl()}/search?q=.`,
    },
  ];
}
