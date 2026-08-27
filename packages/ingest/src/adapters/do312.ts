import {
  contentHash,
  parsePrice,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

type Do312Venue = {
  title?: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  full_address?: string | null;
};

type Do312Imagery = {
  photo?: string | null;
  poster?: string | null;
  thumbnail?: string | null;
  aws?: Record<string, string | null> | null;
};

type Do312Event = {
  id: number;
  title?: string;
  permalink?: string;
  description?: string | null;
  excerpt?: string | null;
  category?: string | null;
  begin_time?: string | null;
  end_time?: string | null;
  is_free?: boolean;
  sold_out?: boolean;
  ticket_info?: string | null;
  buy_url?: string | null;
  venue?: Do312Venue | null;
  imagery?: Do312Imagery | null;
  presented_by?: string | null;
};

type Do312Response = {
  events?: Do312Event[];
};

async function fetchDo312(url: string): Promise<Do312Response> {
  // Do312 Cloudflare-blocks bot-looking UAs; a normal browser UA works.
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      Referer: "https://do312.com/events",
    },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return (await res.json()) as Do312Response;
}

function mapDo312Categories(category: string | null | undefined): string[] {
  const c = (category ?? "").toLowerCase();
  if (/comedy/.test(c)) return ["comedy.showcase"];
  if (/film|movie|cinema/.test(c)) return ["movies"];
  if (/food|drink|dining/.test(c)) return ["food"];
  if (/art|gallery|museum|exhibit/.test(c)) return ["arts"];
  if (/family|kids/.test(c)) return ["family"];
  if (/tech|startup/.test(c)) return ["tech"];
  if (/jazz/.test(c)) return ["music.jazz"];
  if (/electronic|dance|dj|rave|house|techno/.test(c)) {
    return ["music.electronic", "nightlife"];
  }
  if (/music|concert|live/.test(c)) return ["music.live"];
  if (/nightlife|club|party/.test(c)) return ["nightlife"];
  if (/outdoors|park|festival/.test(c)) return ["outdoors"];
  return ["nightlife"];
}

function inferCity(venue?: Do312Venue | null): string {
  const label = (venue?.city ?? venue?.title ?? "").toLowerCase();
  if (label.includes("evanston")) return "evanston";
  if (label.includes("oak park")) return "oak_park";
  return "chicago";
}

/** Do312 JSON: `photo` is often empty or a Cloudinary path; full URLs live under `aws`. */
export function resolveDo312ImageUrl(
  imagery?: Do312Imagery | null,
): string | null {
  if (!imagery) return null;

  const aws = imagery.aws;
  if (aws) {
    const preferred = [
      aws.image,
      aws.poster_w_800,
      aws.cover_image_w_1200_h_450,
      aws.cover_image_h_630_w_1200,
      aws.cover_image_h_300_w_864,
      aws.poster_w_400,
      aws.cover_image_h_250_w_680,
    ];
    for (const url of preferred) {
      if (url?.startsWith("http")) return url;
    }
  }

  for (const candidate of [imagery.photo, imagery.poster, imagery.thumbnail]) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("http")) return trimmed;
    return `https://res.cloudinary.com/dostuff-media/image/upload/${trimmed}`;
  }

  return null;
}

/** Do312 Chicago local events calendar (public JSON). */
export const do312Adapter: SourceAdapter = {
  id: "do312",
  description: "Do312 Chicago events JSON",
  async fetch() {
    const events: NormalizedEvent[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= 5; page++) {
      let data: Do312Response;
      try {
        data = await fetchDo312(`https://do312.com/events.json?page=${page}`);
      } catch (err) {
        console.warn("[do312]", err instanceof Error ? err.message : err);
        break;
      }
      const batch = data.events ?? [];
      if (!batch.length) break;

      for (const ev of batch) {
        if (!ev.title || !ev.begin_time) continue;
        const startsAt = new Date(ev.begin_time);
        if (Number.isNaN(startsAt.getTime())) continue;
        if (startsAt.getTime() < Date.now() - 6 * 3600000) continue;

        const sourceEventId = contentHash([
          "do312",
          String(ev.id),
          startsAt.toISOString().slice(0, 10),
        ]);
        if (seen.has(sourceEventId)) continue;
        seen.add(sourceEventId);

        const priceText = ev.ticket_info ?? "";
        const { priceMin, priceMax, isFree } = parsePrice(priceText);
        const free = Boolean(ev.is_free || isFree);
        const permalink = ev.permalink?.startsWith("http")
          ? ev.permalink
          : ev.permalink
            ? `https://do312.com${ev.permalink}`
            : null;

        events.push({
          source: "do312",
          sourceEventId,
          title: ev.title.trim(),
          description: (ev.excerpt ?? ev.description ?? null)?.slice(0, 2000),
          startsAt,
          endsAt: ev.end_time ? new Date(ev.end_time) : null,
          timezone: "America/Chicago",
          venueName: ev.venue?.title ?? null,
          address: ev.venue?.full_address || ev.venue?.address || null,
          lat: ev.venue?.latitude ?? null,
          lng: ev.venue?.longitude ?? null,
          city: inferCity(ev.venue),
          priceMin: free ? 0 : priceMin,
          priceMax: free ? 0 : priceMax,
          isFree: free,
          categories: mapDo312Categories(ev.category),
          tags: [ev.category, "do312"]
            .filter(Boolean)
            .map((t) => String(t).toLowerCase()),
          url: ev.buy_url || permalink,
          imageUrl: resolveDo312ImageUrl(ev.imagery),
          organizer: ev.presented_by || null,
          registrationStatus: ev.sold_out ? "sold_out" : "open",
          rawPayload: {
            id: ev.id,
            category: ev.category,
            sourcePageUrl: permalink,
            eventDetailsUrl: ev.buy_url || null,
          },
        });
      }

      if (batch.length < 20) break;
    }

    return { events: events.slice(0, 250) };
  },
};
