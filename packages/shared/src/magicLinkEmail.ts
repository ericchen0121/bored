import { cityHeroImageUrl, CITY_HERO_IMAGE_META } from "./cityHeroImages";
import { FEED_CITIES, FEED_CITY_LABELS, type FeedCity } from "./taxonomy";

export type MagicLinkEmailCopy = {
  subject: string;
  /** Short line under the brand / hero. */
  headline: string;
  body: string;
  cta: string;
  heroImageUrl: string | null;
  heroAlt: string | null;
};

const GENERIC: Omit<MagicLinkEmailCopy, "heroImageUrl" | "heroAlt"> = {
  subject: "Your night is waiting",
  headline: "Log in and let the fun begin.",
  body: "Your saves come with you — tap below and pick up where you left off.",
  cta: "Log In",
};

const BY_CITY: Record<
  FeedCity,
  Omit<MagicLinkEmailCopy, "heroImageUrl" | "heroAlt">
> = {
  sf: {
    subject: "Fog's lifting — your night awaits",
    headline: "Log in and let the Bay begin.",
    body: "Mission dance floors, foghorn nights, and whatever you stashed for later — all on this side of the link.",
    cta: "Log In",
  },
  chicago: {
    subject: "Lakefront called — you're in",
    headline: "Log in and let Chicago begin.",
    body: "Warehouse bass, late laughs, and everything you saved along the lake — ready when you are.",
    cta: "Log In",
  },
  la: {
    subject: "Sunset's on — your night awaits",
    headline: "Log in and let LA begin.",
    body: "Hillside golden hour, late Hollywood rooms, and the spots you bookmarked — waiting on the other side.",
    cta: "Log In",
  },
};

/** First path segment if it is a known feed city (`/sf`, `/chicago/music`, …). */
export function feedCityFromPath(
  path: string | null | undefined,
): FeedCity | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const seg = trimmed.split("/").filter(Boolean)[0]?.toLowerCase();
  if (seg && (FEED_CITIES as readonly string[]).includes(seg)) {
    return seg as FeedCity;
  }
  return null;
}

export function parseFeedCitySlug(
  value: string | null | undefined,
): FeedCity | null {
  const v = value?.trim().toLowerCase();
  if (v && (FEED_CITIES as readonly string[]).includes(v)) {
    return v as FeedCity;
  }
  return null;
}

export function magicLinkEmailCopy(
  city: FeedCity | null | undefined,
): MagicLinkEmailCopy {
  if (city) {
    const copy = BY_CITY[city];
    return {
      ...copy,
      heroImageUrl: cityHeroImageUrl(city, { w: 880, h: 400, q: 75 }),
      heroAlt: CITY_HERO_IMAGE_META[city].alt,
    };
  }
  return {
    ...GENERIC,
    heroImageUrl: null,
    heroAlt: null,
  };
}

export function magicLinkEmailCityLabel(
  city: FeedCity | null | undefined,
): string | null {
  return city ? FEED_CITY_LABELS[city] : null;
}
