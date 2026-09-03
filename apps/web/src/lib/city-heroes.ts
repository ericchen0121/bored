import type { FeedArea, FeedCity } from "@bored/shared";
import {
  CITY_HERO_IMAGE_META,
  cityHeroImageUrl,
  FEED_CITY_LABELS,
} from "@bored/shared";

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

const OBJECT_POSITION: Record<FeedCity, string> = {
  sf: "center 35%",
  chicago: "center 62%",
  la: "center 42%",
};

/**
 * Curated Unsplash city covers for feed heroes.
 * Image meta lives in `@bored/shared` (shared with auth emails).
 */
export const CITY_HERO_IMAGES: Record<FeedCity, CityHeroImage> = {
  sf: {
    src: cityHeroImageUrl("sf"),
    alt: CITY_HERO_IMAGE_META.sf.alt,
    credit: CITY_HERO_IMAGE_META.sf.credit,
    unsplashUrl: CITY_HERO_IMAGE_META.sf.unsplashUrl,
    objectPosition: OBJECT_POSITION.sf,
  },
  chicago: {
    src: cityHeroImageUrl("chicago"),
    alt: CITY_HERO_IMAGE_META.chicago.alt,
    credit: CITY_HERO_IMAGE_META.chicago.credit,
    unsplashUrl: CITY_HERO_IMAGE_META.chicago.unsplashUrl,
    objectPosition: OBJECT_POSITION.chicago,
  },
  la: {
    src: cityHeroImageUrl("la"),
    alt: CITY_HERO_IMAGE_META.la.alt,
    credit: CITY_HERO_IMAGE_META.la.credit,
    unsplashUrl: CITY_HERO_IMAGE_META.la.unsplashUrl,
    objectPosition: OBJECT_POSITION.la,
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
  la: {
    palette: ["#f97316", "#f43f5e", "#fbbf24", "#38bdf8"],
    fxMode: "party",
    fxBlendMode: "screen",
    veil: [
      "linear-gradient(115deg, rgba(249, 115, 22, 0.65) 0%, rgba(244, 63, 94, 0.48) 26%, rgba(251, 191, 36, 0.35) 50%, rgba(56, 189, 248, 0.25) 72%, transparent 94%)",
      "radial-gradient(90% 70% at 20% 75%, rgba(249, 115, 22, 0.4) 0%, transparent 55%)",
      "linear-gradient(180deg, rgba(24, 8, 4, 0.22) 0%, rgba(24, 8, 4, 0.05) 35%, rgba(12, 4, 8, 0.5) 68%, rgba(8, 2, 12, 0.92) 100%)",
    ].join(", "),
  },
};

/** @deprecated Use CITY_HERO_STYLES[city].palette */
export const CITY_HERO_PALETTES: Record<FeedCity, CityHeroPalette> = {
  sf: CITY_HERO_STYLES.sf.palette,
  chicago: CITY_HERO_STYLES.chicago.palette,
  la: CITY_HERO_STYLES.la.palette,
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
  if (city === "la" || area === "la") {
    return "Hillside sunsets, taco trucks, and rooms that run late in Hollywood.";
  }
  return "Foghorn nights, Mission dance floors, and sold-out standup rooms.";
}
