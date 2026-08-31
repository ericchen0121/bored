import { finalizeSoftCoalesceEvents } from "@bored/shared/coalesce";
import { finalizeDoStuffExhibitions } from "@bored/shared/exhibitions-ingest";
import {
  isExhibitionCandidate,
  parseDiscoverLaScheduleLine,
  parseWallClockIso,
} from "@bored/shared";
import {
  contentHash,
  parsePrice,
  type AdapterFetchResult,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

export type DoStuffVenue = {
  title?: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  full_address?: string | null;
};

export type DoStuffImagery = {
  photo?: string | null;
  poster?: string | null;
  thumbnail?: string | null;
  aws?: Record<string, string | null> | null;
};

export type DoStuffEvent = {
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
  venue?: DoStuffVenue | null;
  imagery?: DoStuffImagery | null;
  presented_by?: string | null;
};

type DoStuffResponse = {
  events?: DoStuffEvent[];
};

export type DoStuffMediaConfig = {
  id: string;
  description: string;
  baseUrl: string;
  source: string;
  timezone: string;
  inferCity: (venue?: DoStuffVenue | null) => string;
  maxPages?: number;
  maxEvents?: number;
};

async function fetchDoStuffJson(url: string, referer: string): Promise<DoStuffResponse> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      Referer: referer,
    },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return (await res.json()) as DoStuffResponse;
}

async function fetchDiscoverLaSchedule(
  url: string,
): Promise<ReturnType<typeof parseDiscoverLaScheduleLine>> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseDiscoverLaScheduleLine(html);
  } catch {
    return null;
  }
}

export function mapDoStuffCategories(
  category: string | null | undefined,
  title?: string | null,
): string[] {
  const c = (category ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  const blob = `${c} ${t}`;

  if (/comedic|comedy|standup|stand-up|improv|open mic/i.test(blob)) {
    return ["comedy.showcase"];
  }
  if (/film|movie|cinema|television|matinee/i.test(blob)) return ["movies"];
  if (/food|drink|dining|restaurant|trivia|happy hour/i.test(blob)) {
    return ["food"];
  }
  if (/art|gallery|museum|exhibit|cultural|community|book club|literary/i.test(blob)) {
    return ["arts"];
  }
  if (/family|kids|children/i.test(blob)) return ["family"];
  if (/tech|startup|meetup/i.test(blob)) return ["tech"];
  if (/sport|athletic|baseball|basketball|soccer|dodgers|angels|lakers/i.test(blob)) {
    return ["outdoors"];
  }
  if (/jazz/i.test(blob)) return ["music.jazz"];
  if (/electronic|dance|dj|parties|party|rave|house|techno|vegas/i.test(blob)) {
    return ["music.electronic", "nightlife"];
  }
  if (/music|concert|live|acoustic|showcase|bingo night/i.test(blob)) {
    return ["music.live"];
  }
  if (/nightlife|club|bar\b/i.test(blob)) return ["nightlife"];
  if (/outdoors|park|festival|beach/i.test(blob)) return ["outdoors"];
  return ["nightlife"];
}

/** Do Stuff JSON: `photo` is often empty; full URLs live under `aws`. */
export function resolveDoStuffImageUrl(
  imagery?: DoStuffImagery | null,
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

async function enrichDiscoverLaSchedules(
  events: NormalizedEvent[],
): Promise<Map<string, NonNullable<ReturnType<typeof parseDiscoverLaScheduleLine>>>> {
  const out = new Map<
    string,
    NonNullable<ReturnType<typeof parseDiscoverLaScheduleLine>>
  >();
  const urls = new Set<string>();

  for (const ev of events) {
    const payload =
      (ev.rawPayload as Record<string, unknown> | null | undefined) ?? {};
    const detailsUrl =
      typeof payload.eventDetailsUrl === "string"
        ? payload.eventDetailsUrl
        : ev.url;
    if (!detailsUrl?.includes("discoverlosangeles.com/event/")) continue;
    if (
      !isExhibitionCandidate({
        source: ev.source,
        url: detailsUrl,
        description: ev.description,
        categories: ev.categories,
        title: ev.title,
      })
    ) {
      continue;
    }
    urls.add(detailsUrl);
  }

  await Promise.all(
    [...urls].map(async (url) => {
      const schedule = await fetchDiscoverLaSchedule(url);
      if (schedule) out.set(url, schedule);
    }),
  );

  return out;
}

function doStuffFetchResult(
  source: string,
  events: NormalizedEvent[],
  exhibitionOrphans: string[] = [],
): AdapterFetchResult {
  const { events: finalized, orphans } = finalizeSoftCoalesceEvents(events);
  const orphanIds = [
    ...new Set([
      ...orphans.map((o) => o.sourceEventId),
      ...exhibitionOrphans.filter(
        (id) => !finalized.some((e) => e.sourceEventId === id),
      ),
    ]),
  ];

  const result: AdapterFetchResult = {
    events: finalized,
    purgeLegacyCoalesceSources: [source],
  };

  if (orphanIds.length) {
    result.deleteSourceEventIds = [{ source, ids: orphanIds }];
  }

  return result;
}

export function createDoStuffMediaAdapter(config: DoStuffMediaConfig): SourceAdapter {
  const {
    id,
    description,
    baseUrl,
    source,
    timezone,
    inferCity,
    maxPages = 8,
    maxEvents = 300,
  } = config;
  const eventsReferer = `${baseUrl}/events`;

  return {
    id,
    description,
    async fetch() {
      const events: NormalizedEvent[] = [];
      const seen = new Set<string>();

      for (let page = 1; page <= maxPages; page++) {
        let data: DoStuffResponse;
        try {
          data = await fetchDoStuffJson(
            `${baseUrl}/events.json?page=${page}`,
            eventsReferer,
          );
        } catch (err) {
          console.warn(`[${source}]`, err instanceof Error ? err.message : err);
          break;
        }
        const batch = data.events ?? [];
        if (!batch.length) break;

        for (const ev of batch) {
          if (!ev.title || !ev.begin_time) continue;
          const startsAt = parseWallClockIso(ev.begin_time, timezone);
          if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
          if (startsAt.getTime() < Date.now() - 6 * 3600000) continue;

          const sourceEventId = contentHash([
            source,
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
              ? `${baseUrl}${ev.permalink}`
              : null;
          const detailsUrl = ev.buy_url || permalink;

          const categories = mapDoStuffCategories(ev.category, ev.title);
          const tags = [ev.category, source]
            .filter(Boolean)
            .map((tag) => String(tag).toLowerCase());
          if (categories.includes("outdoors") && !tags.includes("sports")) {
            if (/sport|dodgers|angels|lakers|clippers|baseball|basketball/i.test(`${ev.category} ${ev.title}`)) {
              tags.push("sports");
            }
          }
          if (free && !categories.includes("free")) {
            categories.push("free");
          }

          const endsAtRaw = ev.end_time
            ? parseWallClockIso(ev.end_time, timezone)
            : null;

          events.push({
            source,
            sourceEventId,
            title: ev.title.trim(),
            description: (ev.excerpt ?? ev.description ?? null)?.slice(0, 2000),
            startsAt,
            endsAt: endsAtRaw,
            timezone,
            venueName: ev.venue?.title ?? null,
            address: ev.venue?.full_address || ev.venue?.address || null,
            lat: ev.venue?.latitude ?? null,
            lng: ev.venue?.longitude ?? null,
            city: inferCity(ev.venue),
            priceMin: free ? 0 : priceMin,
            priceMax: free ? 0 : priceMax,
            isFree: free,
            categories,
            tags,
            url: detailsUrl,
            imageUrl: resolveDoStuffImageUrl(ev.imagery),
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

      const scheduleByUrl = await enrichDiscoverLaSchedules(events);
      const { events: withExhibitions, orphanIds } = finalizeDoStuffExhibitions(
        events.slice(0, maxEvents),
        source,
        timezone,
        scheduleByUrl,
      );

      return doStuffFetchResult(source, withExhibitions, orphanIds);
    },
  };
}
