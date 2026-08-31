import type { FeedCard, FeedCity, FeedTopic } from "@bored/shared";
import type { EventDetail, FilmDetail } from "@/components/detail/types";
import { cityShareLabel } from "@/lib/city-share";
import {
  cardDetailUrl,
  topicHubTitle,
  topicHubUrl,
  type TopicHubFaq,
} from "@/lib/topic-seo";
import { siteUrl } from "@/lib/site";

type JsonLd = Record<string, unknown>;

export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd(): JsonLd {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: "Bored",
    url: base,
    description:
      "Events, comedy, movies, food, and things to do in SF Bay Area, Chicago, and Los Angeles",
    logo: `${base}/icon`,
  };
}

export function websiteJsonLd(): JsonLd {
  const base = siteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: "Bored",
    url: base,
    description:
      "Events, comedy, movies, food, and things to do in SF Bay Area, Chicago, and Los Angeles",
    publisher: { "@id": `${base}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function topicHubItemListJsonLd(
  city: FeedCity,
  topic: FeedTopic,
  cards: FeedCard[],
): JsonLd {
  const pageUrl = topicHubUrl(city, topic);
  const name = topicHubTitle(city, topic);

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: pageUrl,
    numberOfItems: cards.length,
    itemListElement: cards.slice(0, 50).map((card, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: cardDetailUrl(card),
      name: card.title,
    })),
  };
}

export function topicHubBreadcrumbJsonLd(
  city: FeedCity,
  topic: FeedTopic,
): JsonLd {
  const cityLabel = cityShareLabel(city);
  const base = siteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Bored",
        item: base,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: cityLabel,
        item: `${base}/${city}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: topicHubTitle(city, topic),
        item: topicHubUrl(city, topic),
      },
    ],
  };
}

export function faqPageJsonLd(faqs: TopicHubFaq[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function eventDetailJsonLd(
  event: EventDetail,
  pageUrl: string,
): JsonLd {
  const location =
    event.venueName || event.address || event.neighborhood
      ? {
          "@type": "Place",
          name: event.venueName ?? undefined,
          address:
            event.address || event.neighborhood
              ? {
                  "@type": "PostalAddress",
                  streetAddress: event.address ?? undefined,
                  addressLocality: event.neighborhood ?? undefined,
                }
              : undefined,
        }
      : undefined;

  const offers =
    event.isFree || event.priceMin != null
      ? {
          "@type": "Offer",
          price: event.isFree ? 0 : (event.priceMin ?? undefined),
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${siteUrl()}/r/e/${event.id}`,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description ?? undefined,
    startDate: event.startsAt,
    endDate: event.endsAt ?? undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    image: event.imageUrl ?? undefined,
    url: pageUrl,
    location,
    offers,
    organizer: {
      "@type": "Organization",
      name: "Bored",
      url: siteUrl(),
    },
  };
}

export function movieDetailJsonLd(
  data: FilmDetail,
  pageUrl: string,
): JsonLd {
  const { film, showtimes } = data;
  const aggregateRating =
    film.ratings.letterboxd != null
      ? {
          "@type": "AggregateRating",
          ratingValue: film.ratings.letterboxd,
          bestRating: 5,
        }
      : film.ratings.imdb != null
        ? {
            "@type": "AggregateRating",
            ratingValue: film.ratings.imdb,
            bestRating: 10,
          }
        : film.ratings.rtCritics != null
          ? {
              "@type": "AggregateRating",
              ratingValue: film.ratings.rtCritics,
              bestRating: 100,
            }
          : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: film.title,
    description: film.synopsis ?? undefined,
    image: film.posterUrl ?? film.backdropUrl ?? undefined,
    dateCreated: film.year ? String(film.year) : undefined,
    genre: film.genres.length ? film.genres : undefined,
    url: pageUrl,
    aggregateRating,
    potentialAction: showtimes.slice(0, 5).map((show) => ({
      "@type": "WatchAction",
      target: `${siteUrl()}/r/s/${show.id}`,
      startTime: show.startsAt,
      location: {
        "@type": "Place",
        name: show.theater.name,
        address: show.theater.address ?? show.theater.neighborhood ?? undefined,
      },
    })),
  };
}
