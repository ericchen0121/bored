import type { FeedArea, FeedCity } from "@bored/shared";
import { FEED_CITY_LABELS } from "@bored/shared";

export type CityHeroImage = {
  /** Unsplash CDN URL (cropped for wide hero). */
  src: string;
  alt: string;
  credit: string;
  unsplashUrl: string;
  /** CSS object-position — keeps iconic landmarks in frame under cover crop. */
  objectPosition: string;
};

/** Hot tones for canvas FX (4 colors per metro). */
export type CityHeroPalette = [string, string, string, string];

/** Distinct canvas animation styles per metro. */
export type CityHeroFxMode = "party" | "lake";

export type CityHeroStyle = {
  palette: CityHeroPalette;
  fxMode: CityHeroFxMode;
  /** CSS mix-blend-mode on the FX canvas. */
  fxBlendMode: "screen" | "soft-light";
  /** Multi-layer gradient veil over the photo. */
  veil: string;
};

/**
 * Curated Unsplash city covers for feed heroes.
 * Prefer lively dusk / night shots that take color overlays well.
 */
export const CITY_HERO_IMAGES: Record<FeedCity, CityHeroImage> = {
  sf: {
    src: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1800&h=900&q=80",
    alt: "Golden Gate Bridge in San Francisco",
    credit: "Anthony DELANOIX",
    unsplashUrl: "https://unsplash.com/photos/qRWYDmKgCBY",
    objectPosition: "center 35%",
  },
  chicago: {
    src: "https://images.unsplash.com/photo-1561764188-9d81dc4b6a91?auto=format&fit=crop&crop=focalpoint&fp-x=0.5&fp-y=0.62&w=1800&h=900&q=80",
    alt: "Cloud Gate (The Bean) in Millennium Park, Chicago",
    credit: "Joel Mott",
    unsplashUrl: "https://unsplash.com/photos/2B5aWwADOn4",
    objectPosition: "center 62%",
  },
};

export const CITY_HERO_STYLES: Record<FeedCity, CityHeroStyle> = {
  sf: {
    palette: ["#ff2d95", "#ff6b4a", "#ffc93c", "#22d3ee"],
    fxMode: "party",
    fxBlendMode: "screen",
    veil: [
      "linear-gradient(115deg, rgba(255, 45, 149, 0.72) 0%, rgba(168, 85, 247, 0.55) 24%, rgba(255, 107, 74, 0.42) 48%, rgba(34, 211, 238, 0.28) 68%, rgba(255, 201, 60, 0.12) 82%, transparent 96%)",
      "radial-gradient(90% 70% at 15% 80%, rgba(255, 45, 149, 0.45) 0%, transparent 55%)",
      "linear-gradient(180deg, rgba(20, 4, 28, 0.2) 0%, rgba(20, 4, 28, 0.05) 35%, rgba(12, 4, 24, 0.5) 68%, rgba(8, 2, 18, 0.92) 100%)",
    ].join(", "),
  },
  chicago: {
    palette: ["#2563eb", "#38bdf8", "#f59e0b", "#c8102e"],
    fxMode: "lake",
    fxBlendMode: "screen",
    veil: [
      "linear-gradient(115deg, rgba(37, 99, 235, 0.62) 0%, rgba(129, 140, 248, 0.48) 28%, rgba(56, 189, 248, 0.38) 52%, rgba(245, 158, 11, 0.22) 72%, transparent 94%)",
      "radial-gradient(85% 65% at 72% 75%, rgba(56, 189, 248, 0.42) 0%, transparent 58%)",
      "linear-gradient(180deg, rgba(8, 16, 40, 0.22) 0%, rgba(8, 16, 40, 0.04) 38%, rgba(6, 12, 32, 0.52) 68%, rgba(4, 8, 24, 0.92) 100%)",
    ].join(", "),
  },
};

/** @deprecated Use CITY_HERO_STYLES[city].palette */
export const CITY_HERO_PALETTES: Record<FeedCity, CityHeroPalette> = {
  sf: CITY_HERO_STYLES.sf.palette,
  chicago: CITY_HERO_STYLES.chicago.palette,
};

export function cityHeroTitle(city: FeedCity, area?: FeedArea): string {
  if (area === "bay") return "Bay Area";
  return FEED_CITY_LABELS[city];
}

/**
 * Place-specific hero ledes — not generic aggregator copy.
 * Keep under ~110 chars; voice = local friend, not tourism board.
 */
export function cityHeroLede(city: FeedCity, area?: FeedArea): string {
  if (area === "bay") {
    return "East Bay warehouses, Peninsula stages, and everything between the bridges.";
  }
  if (city === "chicago" || area === "chicago") {
    return "Lakefront golden hour, warehouse bass, and rooms that laugh all week.";
  }
  return "Foghorn nights, Mission dance floors, and comedy that runs late.";
}
