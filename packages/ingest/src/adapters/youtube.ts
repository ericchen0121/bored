import {
  isLocalVideoOutlet,
  isVideoContentLocalToMetro,
  suggestionStartsAt,
  VIDEO_TIP_MAX_AGE_MS,
  videoLocalityText,
  youtubeThumbnailUrl,
  ytVideoRecommendationLabel,
} from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

type FeedCity = "sf" | "chicago" | "la";

type CuratedChannel = {
  /** YouTube @handle (no @ prefix). */
  handle: string;
  city: FeedCity;
  categories: string[];
  foodInfluencer?: boolean;
  cityGuide?: boolean;
  localOutlet?: boolean;
};

/**
 * Curated YouTube channels — Shorts about food openings, events, weekly guides.
 * Requires YOUTUBE_API_KEY (Data API v3).
 */
const CURATED_CHANNELS: CuratedChannel[] = [
  // SF / Bay
  { handle: "Eater", city: "sf", categories: ["food"] },
  { handle: "SanFranciscoEater", city: "sf", categories: ["food"], localOutlet: true },
  { handle: "OnlyInSF", city: "sf", categories: ["food", "outdoors"], cityGuide: true, localOutlet: true },
  { handle: "SFStandard", city: "sf", categories: ["arts", "food"], cityGuide: true, localOutlet: true },

  // Chicago
  { handle: "EaterChicago", city: "chicago", categories: ["food"], localOutlet: true },
  { handle: "ChooseChicago", city: "chicago", categories: ["food", "arts"], cityGuide: true, localOutlet: true },
  { handle: "Do312", city: "chicago", categories: ["nightlife", "arts", "food"], cityGuide: true, localOutlet: true },

  // LA
  { handle: "EaterLA", city: "la", categories: ["food"], localOutlet: true },
  { handle: "DiscoverLosAngeles", city: "la", categories: ["food", "arts", "outdoors"], cityGuide: true, localOutlet: true },
  { handle: "LAist", city: "la", categories: ["food", "arts"], cityGuide: true, localOutlet: true },
];

const SEARCH_LIMIT = 12;
const ISO8601_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelTitle?: string;
    channelId?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export const youtubeAdapter: SourceAdapter = {
  id: "youtube",
  description: "Curated YouTube Shorts — food openings, events, city guides",
  async fetch() {
    const key = process.env.YOUTUBE_API_KEY;
    const events: NormalizedEvent[] = [];

    if (!key) {
      console.warn("[youtube] YOUTUBE_API_KEY missing — skipping");
      return { events: [] };
    }

    for (const ch of CURATED_CHANNELS) {
      try {
        const channelId = await resolveChannelId(ch.handle, key);
        if (!channelId) {
          console.warn(`[youtube] channel not found: ${ch.handle}`);
          continue;
        }

        const searchParams = new URLSearchParams({
          part: "snippet",
          channelId,
          maxResults: String(SEARCH_LIMIT),
          order: "date",
          type: "video",
          videoDuration: "short",
          key,
        });
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?${searchParams}`,
        );
        if (!searchRes.ok) {
          console.warn(`[youtube] search ${ch.handle} ${searchRes.status}`);
          continue;
        }
        const searchData = (await searchRes.json()) as {
          items?: YtSearchItem[];
        };
        const items = searchData.items ?? [];
        const videoIds = items
          .map((i) => i.id?.videoId)
          .filter((id): id is string => Boolean(id));

        if (!videoIds.length) continue;

        const detailsParams = new URLSearchParams({
          // status.embeddable — skip shorts that only play on youtube.com
          part: "contentDetails,snippet,status",
          id: videoIds.join(","),
          key,
        });
        const detailsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?${detailsParams}`,
        );
        const detailsData = detailsRes.ok
          ? ((await detailsRes.json()) as {
              items?: {
                id: string;
                contentDetails?: { duration?: string };
                snippet?: YtSearchItem["snippet"];
                status?: { embeddable?: boolean; privacyStatus?: string };
              }[];
            })
          : { items: [] };

        const detailsById = new Map(
          (detailsData.items ?? []).map((v) => [v.id, v]),
        );

        for (const item of items) {
          const videoId = item.id?.videoId;
          if (!videoId) continue;

          const details = detailsById.get(videoId);
          // Owner disabled embedding → iframe shows "Video unavailable / Watch on YouTube".
          if (details?.status?.embeddable === false) continue;
          if (
            details?.status?.privacyStatus &&
            details.status.privacyStatus !== "public"
          ) {
            continue;
          }

          const title = item.snippet?.title ?? "";
          const description = item.snippet?.description ?? "";
          const blob = videoLocalityText([title, description, ch.handle]);
          if (!blob.trim()) continue;

          const durationSec = parseIsoDuration(
            details?.contentDetails?.duration ?? "",
          );
          const isShort = durationSec > 0 && durationSec <= 90;
          if (!isShort && durationSec > 90) continue;

          const inMetro = isVideoContentLocalToMetro({
            text: blob,
            metro: ch.city,
            handle: ch.handle,
            localOutlet:
              Boolean(ch.localOutlet) ||
              isLocalVideoOutlet(ch.handle, ch.city),
          });
          if (!inMetro) continue;

          const isFoodTip =
            ch.categories.includes("food") &&
            (looksLikeFoodTip(blob) || looksLikeOpening(blob));

          const isCityGuideTip =
            Boolean(ch.cityGuide) &&
            (looksLikeCityGuide(blob) ||
              looksLikeFoodTip(blob) ||
              looksLikeOpening(blob) ||
              looksLikeEvent(blob));

          const isEvent = looksLikeEvent(blob);

          if (!isFoodTip && !isCityGuideTip && !isEvent) continue;

          const published = item.snippet?.publishedAt
            ? new Date(item.snippet.publishedAt)
            : null;
          const stableId = contentHash(["youtube", videoId]);
          const isTip = isFoodTip || isCityGuideTip;
          if (
            isTip &&
            published &&
            !Number.isNaN(published.getTime()) &&
            Date.now() - published.getTime() > VIDEO_TIP_MAX_AGE_MS
          ) {
            continue;
          }
          const startsAt = isTip
            ? suggestionStartsAt(stableId, published)
            : guessEventStart(blob, published) ??
              new Date(Date.now() + 86400000 * 3);

          const thumb =
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url ??
            null;

          const channelTitle =
            item.snippet?.channelTitle ?? ch.handle.replace(/_/g, " ");

          events.push({
            source: "youtube",
            sourceEventId: videoId,
            kind: isTip ? "recommendation" : "event",
            title: title.slice(0, 120) || channelTitle,
            description: description.slice(0, 1500),
            startsAt,
            city: ch.city,
            categories: isFoodTip
              ? ["food"]
              : isCityGuideTip
                ? ch.categories.filter((c) => c !== "free")
                : ch.categories,
            tags: [
              "youtube",
              "short",
              ch.handle.toLowerCase(),
              ...(isCityGuideTip ? ["city_guide"] : []),
              ...(looksLikeOpening(blob) ? ["new_opening"] : []),
            ],
            url: `https://www.youtube.com/shorts/${videoId}`,
            imageUrl:
              thumb ??
              youtubeThumbnailUrl(videoId) ??
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            organizer: channelTitle,
            rawPayload: {
              videoId,
              channelHandle: ch.handle,
              channelTitle,
              isShort: true,
              mediaType: "SHORT",
              published: item.snippet?.publishedAt ?? null,
              foodTip: isFoodTip,
              cityGuide: isCityGuideTip,
              recommendationLabel: ytVideoRecommendationLabel(
                channelTitle,
                true,
              ),
            },
          });
        }
      } catch (err) {
        console.warn(`[youtube] ${ch.handle}`, (err as Error).message);
      }
    }

    return { events };
  },
};

async function resolveChannelId(
  handle: string,
  key: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    part: "id",
    forHandle: handle.startsWith("@") ? handle.slice(1) : handle,
    key,
  });
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?${params}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: { id?: string }[] };
  return data.items?.[0]?.id ?? null;
}

function parseIsoDuration(iso: string): number {
  const m = iso.match(ISO8601_DURATION);
  if (!m) return 0;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}

function looksLikeFoodTip(text: string): boolean {
  return /\b(must try|best|new spot|just opened|restaurant|brunch|food|eats|where to eat|popup|foodie|opening)\b/i.test(
    text,
  );
}

function looksLikeOpening(text: string): boolean {
  return /\b(just opened|now open|grand opening|soft open|new restaurant|opening soon|first look|sneak peek)\b/i.test(
    text,
  );
}

function looksLikeCityGuide(text: string): boolean {
  return /\b(things to do|weekend guide|this week|weekly|date ideas|best spots|hidden gem|what to do|weekend plans|events this week)\b/i.test(
    text,
  );
}

function looksLikeEvent(text: string): boolean {
  return /\b(tonight|this weekend|tickets|festival|concert|party|live music|comedy|market|popup)\b/i.test(
    text,
  );
}

function guessEventStart(text: string, published: Date | null): Date | null {
  if (/tonight/i.test(text)) {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    return d;
  }
  if (/this weekend|saturday|friday/i.test(text)) {
    const d = new Date();
    const day = d.getDay();
    const daysUntilSat = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(20, 0, 0, 0);
    return d;
  }
  if (published && !Number.isNaN(published.getTime())) return published;
  return null;
}

export function curatedYoutubeChannels() {
  return CURATED_CHANNELS;
}
