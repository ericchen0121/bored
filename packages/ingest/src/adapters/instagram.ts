import {
  isLocalVideoOutlet,
  isVideoContentLocalToMetro,
  suggestionStartsAt,
  VIDEO_TIP_MAX_AGE_MS,
  videoLocalityText,
  videoNeighborhoodFromText,
} from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";
import {
  maybeAutoRenewIgAccessToken,
  resolveIgAccessToken,
} from "../instagramAccessToken.js";
import {
  listActiveIgCreators,
  recordIgCreatorScrape,
  SEED_IG_CREATORS,
  type IgCreatorAccount,
} from "../igCreators.js";

const MEDIA_FIELDS =
  "caption,permalink,timestamp,media_type,media_product_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}";
const MEDIA_LIMIT = 30;

type IgMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  children?: { data?: IgMedia[] };
};

export const instagramAdapter: SourceAdapter = {
  id: "instagram",
  description:
    "Curated Instagram accounts — food influencers, reels, city guides, events",
  async fetch() {
    const token = await resolveIgAccessToken();
    const userId = process.env.IG_BUSINESS_USER_ID;
    const events: NormalizedEvent[] = [];

    if (!token || !userId) {
      console.warn(
        "[instagram] IG_ACCESS_TOKEN / IG_BUSINESS_USER_ID missing — skipping",
      );
      return { events: [] };
    }

    const renew = await maybeAutoRenewIgAccessToken();
    if (renew.renewed) {
      console.log(
        `[instagram] auto-renewed access token (expires in ${renew.status.expiresInDays ?? "?"}d)`,
      );
    } else if (
      renew.status.expiresInDays != null &&
      renew.status.expiresInDays < 7
    ) {
      console.warn(
        `[instagram] access token expires in ${renew.status.expiresInDays}d — renew via /admin/instagram`,
      );
    }

    const accessToken = (await resolveIgAccessToken()) ?? token;
    const accounts = await listActiveIgCreators();
    console.log(`[instagram] scraping ${accounts.length} creators`);

    for (const acct of accounts) {
      try {
        const searchUrl = `https://graph.facebook.com/v21.0/${userId}?fields=business_discovery.username(${acct.handle}){username,profile_picture_url,media.limit(${MEDIA_LIMIT}){${MEDIA_FIELDS}}}&access_token=${accessToken}`;
        const res = await fetch(searchUrl);
        if (!res.ok) {
          console.warn(`[instagram] ${acct.handle} ${res.status}`);
          await recordIgCreatorScrape({
            handle: acct.handle,
            ok: false,
            httpStatus: res.status,
            error: `HTTP ${res.status}`,
          });
          continue;
        }
        const data = (await res.json()) as {
          business_discovery?: {
            username?: string;
            profile_picture_url?: string;
            media?: { data?: IgMedia[] };
          };
          error?: { message?: string };
        };
        if (data.error || !data.business_discovery) {
          const msg = data.error?.message ?? "No business_discovery payload";
          console.warn(`[instagram] ${acct.handle} ${msg}`);
          await recordIgCreatorScrape({
            handle: acct.handle,
            ok: false,
            httpStatus: res.status,
            error: msg,
          });
          continue;
        }
        const mediaList = sortMediaForIngest(
          data.business_discovery?.media?.data ?? [],
        );
        const profilePictureUrl =
          data.business_discovery.profile_picture_url ?? null;
        let emitted = 0;

        for (const media of mediaList) {
          const caption = media.caption ?? "";
          if (!caption.trim()) continue;

          const isReel =
            media.media_type === "REELS" ||
            media.media_product_type === "REELS";
          const isVideo = media.media_type === "VIDEO" || isReel;
          const isVideoPost = isReel || media.media_type === "VIDEO";
          const playableUrl = playableVideoUrl(media);
          if (isVideoPost && !playableUrl) continue;

          const blob = videoLocalityText([
            caption,
            media.permalink,
            acct.handle,
          ]);
          const inMetro = isVideoContentLocalToMetro({
            text: blob,
            metro: acct.city,
            handle: acct.handle,
            localOutlet:
              Boolean(acct.localOutlet) ||
              isLocalVideoOutlet(acct.handle, acct.city),
          });
          if (!inMetro) continue;

          const isFoodTip =
            acct.categories.includes("food") &&
            (looksLikeFoodTip(caption) ||
              looksLikeOpening(caption) ||
              // Food influencers: keep local reels even without tip keywords.
              (Boolean(acct.foodInfluencer) && isVideoPost));

          const isCityGuideTip =
            Boolean(acct.cityGuide) &&
            isVideoPost &&
            (looksLikeCityGuide(caption) ||
              looksLikeFoodTip(caption) ||
              looksLikeOpening(caption) ||
              // Metro guides: any substantial local reel.
              caption.trim().length >= 40);

          const isEvent = looksLikeEvent(caption);

          if (!isFoodTip && !isCityGuideTip && !isEvent) continue;

          const published = media.timestamp ? new Date(media.timestamp) : null;
          const stableId = contentHash(["instagram", media.id]);
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
            : guessEventStart(caption, published) ??
              new Date(Date.now() + 86400000 * 3);

          const venue = venueFromCaption(caption);
          const neighborhood = videoNeighborhoodFromText(caption, acct.city);
          const imageUrl = pickImageUrl(media);
          const title = titleFromCaption(caption, acct.handle);

          const categories = isFoodTip
            ? ["food"]
            : isCityGuideTip
              ? acct.categories.filter((c) => c !== "free")
              : acct.categories;

          events.push({
            source: "instagram",
            sourceEventId: media.id,
            kind: isTip ? "recommendation" : "event",
            title,
            description: caption.slice(0, 1500),
            startsAt,
            city: acct.city,
            categories,
            tags: [
              "instagram",
              acct.handle,
              ...(isReel ? ["reel"] : []),
              ...(isVideo && !isReel ? ["video"] : []),
              ...(isCityGuideTip ? ["city_guide"] : []),
              ...(looksLikeOpening(caption) ? ["new_opening"] : []),
            ],
            url: media.permalink ?? `https://instagram.com/${acct.handle}`,
            imageUrl,
            organizer: `@${acct.handle}`,
            venueName: venue,
            neighborhood,
            rawPayload: {
              handle: acct.handle,
              id: media.id,
              mediaType: media.media_type ?? null,
              mediaUrl: playableUrl,
              mediaRefreshedAt: new Date().toISOString(),
              published: media.timestamp ?? null,
              foodTip: isFoodTip,
              cityGuide: isCityGuideTip,
            },
          });
          emitted += 1;
        }

        await recordIgCreatorScrape({
          handle: acct.handle,
          ok: true,
          httpStatus: res.status,
          mediaFetched: mediaList.length,
          eventsEmitted: emitted,
          profilePictureUrl,
        });
      } catch (err) {
        console.warn(`[instagram] ${acct.handle}`, (err as Error).message);
        await recordIgCreatorScrape({
          handle: acct.handle,
          ok: false,
          error: (err as Error).message,
        });
      }
    }

    return { events };
  },
};

export function curatedIgHandles(): IgCreatorAccount[] {
  return SEED_IG_CREATORS;
}

function sortMediaForIngest(media: IgMedia[]): IgMedia[] {
  return [...media].sort((a, b) => {
    const score = (m: IgMedia) => {
      let s = 0;
      if (m.media_type === "REELS") s += 3;
      else if (m.media_type === "VIDEO") s += 2;
      const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
      return s * 1e15 + ts;
    };
    return score(b) - score(a);
  });
}

function playableVideoUrl(media: IgMedia): string | null {
  const isVideo =
    media.media_type === "REELS" ||
    media.media_type === "VIDEO" ||
    media.media_product_type === "REELS";
  if (isVideo && media.media_url?.trim()) return media.media_url;
  const child = media.children?.data?.find(
    (c) =>
      (c.media_type === "REELS" || c.media_type === "VIDEO") &&
      c.media_url?.trim(),
  );
  return child?.media_url?.trim() || null;
}

function pickImageUrl(media: IgMedia): string | null {
  if (media.media_type === "REELS" || media.media_type === "VIDEO") {
    return media.thumbnail_url ?? playableVideoUrl(media) ?? null;
  }
  return media.media_url ?? media.thumbnail_url ?? null;
}

function titleFromCaption(caption: string, handle: string): string {
  const lines = caption
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^📍/.test(line)) {
      const place = line.replace(/^📍\s*/, "").split(/[,\n]/)[0]?.trim();
      if (place && place.length >= 3 && place.length <= 80) return place;
    }
  }

  const first = lines[0] ?? "";
  const cleaned = first
    .replace(/^POV:\s*/i, "")
    .replace(/^Save this for .+!?\s*/i, "")
    .replace(/^:\s*/, "")
    .slice(0, 120)
    .trim();
  if (cleaned.length >= 3) return cleaned;

  const tagged = caption.match(/@([a-z0-9._]+)/i);
  if (tagged?.[1] && /[a-z]/i.test(tagged[1])) {
    return tagged[1].replace(/_/g, " ");
  }

  return `@${handle} tip`;
}

function venueFromCaption(caption: string): string | null {
  const pin = caption.match(/📍\s*([^\n@#]+)/);
  if (pin?.[1]) {
    const place = pin[1].split(/[,\n]/)[0]?.trim();
    if (place && place.length >= 3 && place.length <= 80) return place;
  }
  const at = caption.match(
    /\bat\s+(@?[A-Za-z0-9._]+|[A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,4})/,
  );
  if (at?.[1] && !/^@\w+$/.test(at[1])) return at[1].trim().slice(0, 80);
  return null;
}

function looksLikeFoodTip(caption: string): boolean {
  return /\b(must try|must order|best|new spot|just opened|where to eat|restaurant|brunch|dinner|lunch|tacos|pizza|sushi|ramen|boba|coffee|bakery|dish|menu|popup|pop-up|foodie|eats|📍|#sfeats|#sffoodie|#bayareafood|#eeeeeats|#chicagoeats|#lafood)\b/i.test(
    caption,
  );
}

function looksLikeOpening(caption: string): boolean {
  return /\b(just opened|now open|grand opening|soft open|new restaurant|new spot|opening soon|opening day|first look|sneak peek|newly opened|soft launch)\b/i.test(
    caption,
  );
}

function looksLikeCityGuide(caption: string): boolean {
  return /\b(things to do|weekend guide|this week|weekly|date ideas|best spots|hidden gem|must visit|itinerary|roundup|guide to|what to do|weekend plans|events this week|happening this week)\b/i.test(
    caption,
  );
}

function looksLikeEvent(caption: string): boolean {
  return /\b(tonight|this weekend|saturday|friday|doors|tickets|rsvp|show|opening night|live music|party|festival|popup shop|block party|market|concert|comedy show)\b/i.test(
    caption,
  );
}

function guessEventStart(
  caption: string,
  published: Date | null,
): Date | null {
  if (/tonight/i.test(caption)) {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    return d;
  }
  if (/this weekend|saturday|friday/i.test(caption)) {
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
