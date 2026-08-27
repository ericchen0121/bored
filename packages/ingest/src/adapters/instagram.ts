import { suggestionStartsAt } from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

type CuratedAccount = {
  handle: string;
  categories: string[];
  /** Reels/posts from this account are treated as SF food tips, not just events. */
  foodInfluencer?: boolean;
};

/**
 * Phase 2: curated SF Instagram accounts → caption-derived candidates.
 * Uses Instagram Graph when IG_ACCESS_TOKEN + IG_BUSINESS_USER_ID are set;
 * otherwise returns empty (no scrape without credentials).
 */
const CURATED_ACCOUNTS: CuratedAccount[] = [
  // Food / dining outlets
  { handle: "eater_sf", categories: ["food"] },
  { handle: "theinfatuation", categories: ["food"] },
  { handle: "infatuationsf", categories: ["food"] },
  { handle: "foundsf", categories: ["food"] },
  { handle: "tablehopper", categories: ["food"] },
  { handle: "sfchronicle_food", categories: ["food"], foodInfluencer: true },
  { handle: "timeoutsanfrancisco", categories: ["food", "nightlife", "arts"] },
  { handle: "onlyinsf", categories: ["food", "outdoors"] },
  // SF food influencers (reels-first)
  { handle: "sherryeatworld", categories: ["food"], foodInfluencer: true },
  { handle: "cheycheyfromthebay", categories: ["food"], foodInfluencer: true },
  { handle: "violetwitchel", categories: ["food"], foodInfluencer: true },
  { handle: "thesnacksensei", categories: ["food"], foodInfluencer: true },
  { handle: "eatwithslay", categories: ["food"], foodInfluencer: true },
  { handle: "pastrywithjenn", categories: ["food"], foodInfluencer: true },
  { handle: "festusfeasts", categories: ["food"], foodInfluencer: true },
  { handle: "oishiimoments", categories: ["food"], foodInfluencer: true },
  { handle: "jor.favfoodie", categories: ["food"], foodInfluencer: true },
  { handle: "angelinahong_", categories: ["food"], foodInfluencer: true },
  {
    handle: "confession.of.a.foodie",
    categories: ["food"],
    foodInfluencer: true,
  },
  { handle: "allie.eats", categories: ["food"], foodInfluencer: true },
  { handle: "taratastessf", categories: ["food"], foodInfluencer: true },
  { handle: "neverendingflavor", categories: ["food"], foodInfluencer: true },
];

const MEDIA_FIELDS =
  "caption,permalink,timestamp,media_type,media_url,thumbnail_url";
const MEDIA_LIMIT = 25;

type IgMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
};

export const instagramAdapter: SourceAdapter = {
  id: "instagram",
  description:
    "Curated SF Instagram accounts — food influencers, reels, city tips",
  async fetch() {
    const token = process.env.IG_ACCESS_TOKEN;
    const userId = process.env.IG_BUSINESS_USER_ID;
    const events: NormalizedEvent[] = [];

    if (!token || !userId) {
      console.warn(
        "[instagram] IG_ACCESS_TOKEN / IG_BUSINESS_USER_ID missing — skipping",
      );
      return { events: [] };
    }

    for (const acct of CURATED_ACCOUNTS) {
      try {
        const searchUrl = `https://graph.facebook.com/v21.0/${userId}?fields=business_discovery.username(${acct.handle}){media.limit(${MEDIA_LIMIT}){${MEDIA_FIELDS}}}&access_token=${token}`;
        const res = await fetch(searchUrl);
        if (!res.ok) {
          console.warn(`[instagram] ${acct.handle} ${res.status}`);
          continue;
        }
        const data = (await res.json()) as {
          business_discovery?: {
            media?: { data?: IgMedia[] };
          };
        };
        const mediaList = sortMediaForIngest(
          data.business_discovery?.media?.data ?? [],
        );

        for (const media of mediaList) {
          const caption = media.caption ?? "";
          if (!caption.trim()) continue;

          const isReel = media.media_type === "REELS";
          const isVideo = media.media_type === "VIDEO";
          const isFoodTip =
            acct.categories.includes("food") &&
            mentionsSfArea(caption) &&
            (looksLikeFoodTip(caption) ||
              ((isReel || isVideo) && Boolean(acct.foodInfluencer)));
          const isEvent = looksLikeEvent(caption);

          if (!isFoodTip && !isEvent) continue;

          const published = media.timestamp ? new Date(media.timestamp) : null;
          const stableId = contentHash(["instagram", media.id]);
          const startsAt = isFoodTip
            ? suggestionStartsAt(stableId, published)
            : guessEventStart(caption, published) ??
              new Date(Date.now() + 86400000 * 3);

          const venue = venueFromCaption(caption);
          const neighborhood = neighborhoodFromCaption(caption);
          const imageUrl = pickImageUrl(media);
          const title = titleFromCaption(caption, acct.handle);

          events.push({
            source: "instagram",
            sourceEventId: media.id,
            kind: isFoodTip ? "recommendation" : "event",
            title,
            description: caption.slice(0, 1500),
            startsAt,
            city: "sf",
            categories: isFoodTip ? ["food"] : acct.categories,
            tags: [
              "instagram",
              acct.handle,
              ...(isReel ? ["reel"] : []),
              ...(isVideo && !isReel ? ["video"] : []),
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
              mediaUrl: media.media_url ?? null,
              published: media.timestamp ?? null,
              foodTip: isFoodTip,
            },
          });
        }
      } catch (err) {
        console.warn(`[instagram] ${acct.handle}`, (err as Error).message);
      }
    }

    return { events };
  },
};

export function curatedIgHandles() {
  return CURATED_ACCOUNTS;
}

/** Reels and recent video first — where SF restaurant tips usually land. */
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

function pickImageUrl(media: IgMedia): string | null {
  if (media.media_type === "REELS" || media.media_type === "VIDEO") {
    return media.thumbnail_url ?? media.media_url ?? null;
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

const NEIGHBORHOOD_RES: { re: RegExp; name: string }[] = [
  { re: /\bmission\b/i, name: "Mission" },
  { re: /\bsoma\b|south of market/i, name: "SoMa" },
  { re: /\bnorth beach\b/i, name: "North Beach" },
  { re: /\brichmond\b/i, name: "Richmond" },
  { re: /\bsunset\b/i, name: "Sunset" },
  { re: /\bhaight\b/i, name: "Haight" },
  { re: /\bhayes valley\b/i, name: "Hayes Valley" },
  { re: /\bmarina\b/i, name: "Marina" },
  { re: /\bembarcadero\b|ferry building/i, name: "Embarcadero" },
  { re: /\bchinatown\b/i, name: "Chinatown" },
  { re: /\bjapantown\b/i, name: "Japantown" },
  { re: /\bdogpatch\b/i, name: "Dogpatch" },
  { re: /\bpotrero\b/i, name: "Potrero Hill" },
  { re: /\bcastro\b/i, name: "Castro" },
  { re: /\bnopa\b/i, name: "NoPa" },
  { re: /\btenderloin\b/i, name: "Tenderloin" },
  { re: /\bfidi\b|financial district\b/i, name: "Financial District" },
  { re: /\boakland\b/i, name: "Oakland" },
  { re: /\bberkeley\b/i, name: "Berkeley" },
];

function neighborhoodFromCaption(caption: string): string | null {
  for (const { re, name } of NEIGHBORHOOD_RES) {
    if (re.test(caption)) return name;
  }
  return null;
}

function mentionsSfArea(caption: string): boolean {
  return /\b(san francisco|#sf\b|#sfeats|#sffoodie|#bayareafood|#bayareaeats|#onlyinsf|#sanfrancisco|sf bay|bay area|📍.*\b(sf|san francisco)\b)/i.test(
    caption,
  ) || NEIGHBORHOOD_RES.some(({ re }) => re.test(caption));
}

function looksLikeFoodTip(caption: string): boolean {
  return /\b(must try|must order|best|new spot|just opened|where to eat|restaurant|brunch|dinner|lunch|tacos|pizza|sushi|ramen|boba|coffee|bakery|dish|menu|popup|pop-up|foodie|eats|📍|#sfeats|#sffoodie|#bayareafood|#eeeeeats)\b/i.test(
    caption,
  );
}

function looksLikeEvent(caption: string): boolean {
  return /\b(tonight|this weekend|saturday|friday|doors|tickets|rsvp|show|opening night|live music|party|festival|popup shop)\b/i.test(
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
