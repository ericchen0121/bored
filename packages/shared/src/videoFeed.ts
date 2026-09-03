/** Short-form video helpers for Instagram reels + YouTube Shorts in feed/detail UI. */

import {
  instagramEmbedUrl,
  instagramMediaPreviewUrl,
  isInstagramVideo,
} from "./instagram";

export function youtubeVideoIdFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const shortIdx = parts.indexOf("shorts");
      if (shortIdx >= 0 && parts[shortIdx + 1]) {
        const id = parts[shortIdx + 1]!;
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeThumbnailUrl(
  videoId: string | null | undefined,
): string | null {
  if (!videoId?.trim() || !/^[\w-]{11}$/.test(videoId.trim())) return null;
  return `https://i.ytimg.com/vi/${videoId.trim()}/hqdefault.jpg`;
}

/** Instagram/Facebook CDN URLs expire and are blocked as hotlinked `<img>` src. */
export function isInstagramCdnUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return /cdninstagram\.com|fbcdn\.net/i.test(url);
}

/**
 * Poster URL safe to use in `<img>` tags.
 * YouTube → stable i.ytimg.com thumb.
 * Instagram → public /media/?size=l preview (CDN hotlinks expire).
 */
export function feedVideoPosterUrl(card: {
  source?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  rawPayload?: { videoId?: unknown } | null;
}): string | null {
  if (card.source === "youtube") {
    const id =
      typeof card.rawPayload?.videoId === "string"
        ? card.rawPayload.videoId
        : youtubeVideoIdFromUrl(card.url);
    return youtubeThumbnailUrl(id);
  }
  if (card.source === "instagram") {
    return instagramMediaPreviewUrl(card.url);
  }
  if (isInstagramCdnUrl(card.imageUrl)) {
    return instagramMediaPreviewUrl(card.url) ?? null;
  }
  return card.imageUrl ?? null;
}

export function feedVideoEmbedSrc(card: {
  source?: string | null;
  url?: string | null;
}): string | null {
  if (card.source === "instagram") return instagramEmbedUrl(card.url);
  if (card.source === "youtube") {
    const id = youtubeVideoIdFromUrl(card.url);
    return id ? youtubeEmbedUrl(id) : null;
  }
  return null;
}

export function youtubeEmbedUrl(
  videoId: string | null | undefined,
  opts?: { autoplay?: boolean; mute?: boolean; controls?: boolean },
): string | null {
  if (!videoId?.trim()) return null;
  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
  });
  if (opts?.controls === false) params.set("controls", "0");
  if (opts?.autoplay) params.set("autoplay", "1");
  if (opts?.autoplay) {
    params.set("mute", opts.mute === false ? "0" : "1");
  }
  return `https://www.youtube-nocookie.com/embed/${videoId.trim()}?${params}`;
}

/** Max reels in the For you / Today carousel — kept out of the ranked event slots. */
export const FEED_VIDEO_CAROUSEL_LIMIT = 40;

/**
 * SQL cap when loading Instagram/YouTube for the carousel.
 * Must stay above FEED_VIDEO_CACHE_POOL_LIMIT so ranking still has headroom
 * after locality / mediaUrl filters — never unbounded (was loading 700+ rows).
 */
export const FEED_VIDEO_FETCH_LIMIT = FEED_VIDEO_CAROUSEL_LIMIT * 4;

/**
 * Cap for curated non-video sources (food, food_deals, activities, recurring, …).
 * Unbounded SELECT was the happy-hours / food topic cold-miss cliff (~9s).
 */
export const FEED_CURATED_FETCH_LIMIT = 120;

/** Editorial (non-video) food tips kept in the timeline after pulling reels out. */
export const FEED_EDITORIAL_FOOD_TIP_LIMIT = 6;

export function isFeedVideoRankable(item: {
  source?: string | null;
  tags?: string[] | null;
  mediaType?: string | null;
  rawPayload?: unknown;
}): boolean {
  const payload =
    item.rawPayload && typeof item.rawPayload === "object"
      ? (item.rawPayload as {
          mediaType?: unknown;
          isShort?: unknown;
          videoId?: unknown;
        })
      : null;
  return isFeedVideo({
    source: item.source,
    tags: item.tags,
    rawPayload: {
      mediaType: item.mediaType ?? payload?.mediaType,
      isShort: payload?.isShort,
      videoId: payload?.videoId,
    },
  });
}

export function partitionFeedVideoCards<T extends {
  source?: string | null;
  tags?: string[] | null;
  mediaType?: string | null;
}>(
  cards: T[],
  limit = FEED_VIDEO_CAROUSEL_LIMIT,
): { videos: T[]; rest: T[] } {
  const videos: T[] = [];
  const rest: T[] = [];
  for (const card of cards) {
    if (isFeedVideoCard(card) && videos.length < limit) {
      videos.push(card);
    } else if (!isFeedVideoCard(card)) {
      rest.push(card);
    }
  }
  return { videos, rest };
}

export function isYoutubeShort(opts: {
  source?: string | null;
  tags?: string[] | null;
  rawPayload?: { isShort?: unknown } | null;
}): boolean {
  if (opts.source !== "youtube") return false;
  if (opts.rawPayload?.isShort === true) return true;
  const tags = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));
  return tags.has("short") || tags.has("shorts");
}

export function isFeedVideo(opts: {
  source?: string | null;
  tags?: string[] | null;
  rawPayload?: {
    mediaType?: unknown;
    foodTip?: unknown;
    isShort?: unknown;
    videoId?: unknown;
  } | null;
}): boolean {
  if (isInstagramVideo(opts)) return true;
  if (opts.source === "youtube") {
    if (isYoutubeShort(opts)) return true;
    const tags = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));
    if (tags.has("short") || tags.has("shorts")) return true;
    if (typeof opts.rawPayload?.videoId === "string") return true;
  }
  return false;
}

/** Cards eligible for the vertical reels/shorts feed layout. */
export function isFeedVideoCard(card: {
  source?: string | null;
  tags?: string[] | null;
  mediaType?: string | null;
}): boolean {
  return isFeedVideo({
    source: card.source,
    tags: card.tags,
    rawPayload: { mediaType: card.mediaType },
  });
}

export function ytVideoRecommendationLabel(
  channelTitle: string,
  isShort: boolean,
): string {
  const name = channelTitle.trim() || "YouTube";
  return isShort ? `Short · ${name}` : `Video · ${name}`;
}
