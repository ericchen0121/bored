import type { FeedCity } from "./taxonomy";

/**
 * Curated Unsplash city covers — shared by web heroes and auth emails.
 * Prefer lively dusk / night shots that take color overlays well.
 */
export type CityHeroImageMeta = {
  /** Unsplash photo id (path segment after /photo-). */
  photoId: string;
  alt: string;
  credit: string;
  unsplashUrl: string;
};

export const CITY_HERO_IMAGE_META: Record<FeedCity, CityHeroImageMeta> = {
  sf: {
    photoId: "1501594907352-04cda38ebc29",
    alt: "Golden Gate Bridge in San Francisco",
    credit: "Anthony DELANOIX",
    unsplashUrl: "https://unsplash.com/photos/qRWYDmKgCBY",
  },
  chicago: {
    photoId: "1561764188-9d81dc4b6a91",
    alt: "Cloud Gate (The Bean) in Millennium Park, Chicago",
    credit: "Joel Mott",
    unsplashUrl: "https://unsplash.com/photos/2B5aWwADOn4",
  },
  la: {
    photoId: "1594663805807-29a7cc1847c0",
    alt: "Hollywood Sign at sunset, Los Angeles",
    credit: "Venti Views",
    unsplashUrl: "https://unsplash.com/photos/6QDvwq2Fjsc",
  },
};

export type CityHeroImageUrlOpts = {
  w?: number;
  h?: number;
  q?: number;
  /** Extra Unsplash query params (e.g. crop=focalpoint&fp-x=0.5&fp-y=0.62). */
  extra?: string;
};

/** Build a cropped Unsplash CDN URL for a metro hero. */
export function cityHeroImageUrl(
  city: FeedCity,
  opts: CityHeroImageUrlOpts = {},
): string {
  const { photoId } = CITY_HERO_IMAGE_META[city];
  const w = opts.w ?? 1800;
  const h = opts.h ?? 900;
  const q = opts.q ?? 80;
  const chicagoCrop =
    city === "chicago"
      ? "&crop=focalpoint&fp-x=0.5&fp-y=0.62"
      : "";
  const extra = opts.extra ? `&${opts.extra.replace(/^\?/, "").replace(/^&/, "")}` : "";
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop${chicagoCrop}&w=${w}&h=${h}&q=${q}${extra}`;
}
