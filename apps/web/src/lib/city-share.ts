import type { Metadata } from "next";
import type { FeedCity } from "@bored/shared";
import { FEED_CITY_LABELS } from "@bored/shared";
import { CITY_HERO_IMAGES, cityHeroLede } from "@/lib/city-heroes";
import type { ShareCardProps } from "@/lib/og-share-card";

export function cityShareLabel(city: FeedCity): string {
  if (city === "sf") return "SF Bay Area";
  return FEED_CITY_LABELS[city];
}

function cityShareDescription(city: FeedCity): string {
  if (city === "chicago") {
    return "Events, comedy, and things to do in Chicago";
  }
  if (city === "la") {
    return "Events, comedy, and things to do in Los Angeles";
  }
  return "Events, comedy, movies, and things to do in San Francisco and the Bay Area";
}

export function cityShareMetadata(city: FeedCity): Metadata {
  const label = cityShareLabel(city);
  const description = cityShareDescription(city);
  const title = `Bored — ${label}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Bored",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function cityShareCardProps(city: FeedCity): ShareCardProps {
  const imageUrl =
    city === "chicago"
      ? CITY_HERO_IMAGES.chicago.src
      : city === "la"
        ? CITY_HERO_IMAGES.la.src
        : city === "sf"
          ? CITY_HERO_IMAGES.sf.src
          : null;
  return {
    title: "Find something to do.",
    subtitle: cityHeroLede(city),
    imageUrl,
  };
}
