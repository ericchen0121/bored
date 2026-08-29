import { cityKeyFromLabel, partifulFeedImageUrl } from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

type PartifulMapsInfo = {
  name?: string;
  addressLines?: string[];
  approximateLocation?: string;
  googleMapsUrl?: string;
};

type PartifulLocationInfo = {
  neighborhood?: string | null;
  mapsInfo?: PartifulMapsInfo;
  displayAddressLines?: string[];
  displayName?: string;
};

type PartifulImage = {
  source?: string;
  type?: string;
  url?: string;
  width?: number;
  height?: number;
  upload?: { path?: string; url?: string };
  gif?: { images?: { original?: { url?: string }; fixed_width?: { url?: string } } };
};

type PartifulEvent = {
  id?: string;
  title?: string;
  description?: string | null;
  startDate?: string;
  endDate?: string | null;
  timezone?: string;
  image?: PartifulImage | null;
  location?: string | null;
  locationInfo?: PartifulLocationInfo | null;
  hostName?: string | null;
  isPublic?: boolean;
  status?: string;
  interestedGuestCount?: number;
  goingGuestCount?: number;
  approvedGuestCount?: number;
  maybeGuestCount?: number;
  showGuestCount?: boolean;
};

type PartifulFeedItem = {
  id?: string;
  event?: PartifulEvent;
};

const EXPLORE_URLS = ["https://partiful.com/explore/sf"] as const;

function parseApproxCity(approx?: string | null): string {
  if (!approx) return "sf";
  // "San Francisco, CA" / "Oakland, CA" → city label before comma
  const city = approx.split(",")[0]?.trim() || approx;
  return cityKeyFromLabel(city);
}

function venueFrom(ev: PartifulEvent): {
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
} {
  const maps = ev.locationInfo?.mapsInfo;
  const lines = maps?.addressLines ?? ev.locationInfo?.displayAddressLines ?? [];
  const address =
    lines.length > 0
      ? lines.join(", ")
      : typeof ev.location === "string"
        ? ev.location
        : null;
  return {
    venueName: maps?.name ?? ev.locationInfo?.displayName ?? null,
    address,
    neighborhood: ev.locationInfo?.neighborhood ?? null,
    city: parseApproxCity(maps?.approximateLocation),
  };
}

/** Partiful explore SSR has no per-event tags — infer from section rails + copy. */
export function partifulCategoriesAndTags(opts: {
  title: string;
  description?: string | null;
  venueName?: string | null;
  sections?: string[];
}): { categories: string[]; tags: string[] } {
  const text = `${opts.title} ${opts.description ?? ""} ${opts.venueName ?? ""}`.toLowerCase();
  const sectionBlob = (opts.sections ?? []).join(" ").toLowerCase();
  const cats = new Set<string>();
  const tags = new Set<string>(["partiful"]);

  if (/make something|modern renaissance/i.test(sectionBlob)) cats.add("arts");
  if (/good eats/i.test(sectionBlob)) cats.add("food");
  if (/markets?\s*&\s*fleas?/i.test(sectionBlob)) {
    cats.add("arts");
    tags.add("market");
  }
  if (/evenings?\s*&\s*weekends?/i.test(sectionBlob)) {
    cats.add("nightlife");
  }

  if (/workshop|class\b|drawing|figure|watercolor|craft|bouquet|florist|candle class|trunk show|art show|gallery|exhibit|make\b/i.test(text)) {
    cats.add("arts");
  }
  if (/pickleball|run club|hike|hiking|paddle|yoga|pilates|field day|stroller walk|walk with friends|walk\b|marathon|corgi|sports|fitness/i.test(text)) {
    cats.add("outdoors");
    tags.add("sports");
  }
  if (/picnic|park swap|park hangout|dolores|ggp|golden gate park/i.test(text)) {
    cats.add("outdoors");
  }
  if (/matcha|coffee|donuts|wine|brunch|\bfood\b|\beat\b|restaurant|bar crawl|tasting|kitchen|matcha society/i.test(text)) {
    cats.add("food");
  }
  if (/comedy|standup|stand-up|improv|drag show/i.test(text)) {
    cats.add("comedy.showcase");
  }
  if (/dj\b|edm|techno|beats|live at|karaoke|afters|mint glaze|sound of|night\b|rave/i.test(text)) {
    cats.add("music.live");
    cats.add("nightlife");
  }
  if (/\bparty\b|club night|bar\b|fireworks/i.test(text)) {
    cats.add("nightlife");
  }
  if (/book club|conversation|talk\b|tech week|meetup|networking/i.test(text)) {
    cats.add("tech");
  }
  if (/movie|film|cinema|theater/i.test(text)) {
    cats.add("movies");
  }
  if (/flea market|closet sale|swap|yard sale|vendor|market\b/i.test(text)) {
    cats.add("arts");
    tags.add("market");
  }
  if (/festival|fest\b/i.test(text)) {
    cats.add("outdoors");
    tags.add("festival");
  }

  // Daytime socials mis-labeled when "Evenings & Weekends" also lists them.
  if (
    cats.has("nightlife") &&
    /workshop|pickleball|class\b|picnic|walk|run club|book club|market|art show|coffee|matcha|donuts|paddle|yoga|pilates|field day|hike/i.test(text)
  ) {
    cats.delete("nightlife");
    cats.delete("music.live");
  }

  if (cats.size === 0) {
    // Social discovery default — not nightlife.
    cats.add("outdoors");
  }

  return { categories: [...cats], tags: [...tags] };
}

type PartifulCollected = {
  event: PartifulEvent;
  sections: string[];
};

function collectPartifulFromPage(data: unknown): PartifulCollected[] {
  const pageProps = (data as { props?: { pageProps?: Record<string, unknown> } })
    .props?.pageProps;
  if (!pageProps) return [];

  const byId = new Map<string, PartifulCollected>();
  const add = (ev: PartifulEvent, sectionTitle: string) => {
    if (!ev.id || !ev.title?.trim() || !ev.startDate) return;
    const id = String(ev.id);
    const cur = byId.get(id) ?? { event: ev, sections: [] };
    if (!cur.sections.includes(sectionTitle)) cur.sections.push(sectionTitle);
    byId.set(id, cur);
  };

  const ingestSection = (
    section: { title?: string; items?: PartifulFeedItem[] } | null | undefined,
  ) => {
    if (!section) return;
    const title = section.title?.trim() || "Explore";
    for (const item of section.items ?? []) {
      if (item.event) add(item.event, title);
    }
  };

  ingestSection(
    pageProps.trendingSection as { title?: string; items?: PartifulFeedItem[] },
  );
  for (const section of (pageProps.sections as { title?: string; items?: PartifulFeedItem[] }[]) ?? []) {
    ingestSection(section);
  }
  for (const item of (pageProps.feedItems as PartifulFeedItem[]) ?? []) {
    if (item.event) add(item.event, "Explore");
  }

  for (const ev of collectPartifulEvents(data)) {
    if (!ev.id) continue;
    const id = String(ev.id);
    if (!byId.has(id)) byId.set(id, { event: ev, sections: [] });
  }

  return [...byId.values()];
}

function toNormalized(
  ev: PartifulEvent,
  opts?: { trending?: boolean; sections?: string[] },
): NormalizedEvent | null {
  const title = ev.title?.trim();
  const start = ev.startDate;
  if (!title || !start) return null;
  if (ev.status && ev.status !== "PUBLISHED") return null;
  if (ev.isPublic === false) return null;

  const startsAt = new Date(start);
  if (Number.isNaN(startsAt.getTime())) return null;
  // Drop events that ended more than a day ago
  const endRaw = ev.endDate ? new Date(ev.endDate) : null;
  const endsAt =
    endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : null;
  if ((endsAt ?? startsAt).getTime() < Date.now() - 86400000) return null;

  const id = String(ev.id ?? contentHash([title, start]));
  const place = venueFrom(ev);
  const trending = Boolean(opts?.trending);
  const { categories, tags: inferredTags } = partifulCategoriesAndTags({
    title,
    description: ev.description,
    venueName: place.venueName,
    sections: opts?.sections,
  });
  const tags = trending ? [...inferredTags, "trending"] : inferredTags;

  return {
    source: "partiful",
    sourceEventId: id,
    title,
    description: ev.description ?? null,
    startsAt,
    endsAt,
    timezone: ev.timezone || "America/Los_Angeles",
    venueName: place.venueName,
    address: place.address,
    neighborhood: place.neighborhood,
    city: place.city,
    isFree: false,
    categories,
    tags,
    url: `https://partiful.com/e/${id}`,
    imageUrl: partifulFeedImageUrl(ev.image),
    organizer: ev.hostName ?? null,
    rawPayload: {
      ...ev,
      partifulSections: opts?.sections ?? [],
      ...(trending ? { partifulTrending: true } : {}),
    },
  };
}

/** IDs from Partiful's "Trending in the Bay" (or metro equivalent) carousel. */
function trendingEventIds(data: unknown): Set<string> {
  const ids = new Set<string>();
  if (!data || typeof data !== "object") return ids;
  const pageProps = (data as { props?: { pageProps?: Record<string, unknown> } })
    .props?.pageProps;
  const section = pageProps?.trendingSection as
    | { items?: PartifulFeedItem[] }
    | undefined;
  for (const item of section?.items ?? []) {
    const id = item.event?.id;
    if (id != null) ids.add(String(id));
  }
  return ids;
}

function collectPartifulEvents(node: unknown, out: PartifulEvent[] = []): PartifulEvent[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectPartifulEvents(item, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  // Prefer nested `.event` wrappers from feed/section items
  if (obj.event && typeof obj.event === "object") {
    collectPartifulEvents(obj.event, out);
  }
  const title = obj.title;
  const startDate = obj.startDate;
  const id = obj.id;
  if (
    typeof title === "string" &&
    typeof startDate === "string" &&
    (typeof id === "string" || typeof id === "number")
  ) {
    out.push(obj as PartifulEvent);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "event") continue;
    collectPartifulEvents(v, out);
  }
  return out;
}

async function fetchExplore(url: string): Promise<NormalizedEvent[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BoredSFBot/0.1 (+https://github.com/bored)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
  );
  if (!match?.[1]) return [];
  const data = JSON.parse(match[1]) as unknown;
  const trendingIds = trendingEventIds(data);
  const found = collectPartifulFromPage(data);
  const out: NormalizedEvent[] = [];
  const seen = new Set<string>();
  for (const { event: raw, sections } of found) {
    const id = raw.id != null ? String(raw.id) : null;
    const ev = toNormalized(raw, {
      trending: id != null && trendingIds.has(id),
      sections,
    });
    if (!ev || seen.has(ev.sourceEventId)) continue;
    seen.add(ev.sourceEventId);
    out.push(ev);
  }
  return out;
}

/** Partiful public explore (SF) via Next.js SSR payload — covers + end times. */
export const partifulAdapter: SourceAdapter = {
  id: "partiful",
  description: "Partiful SF public explore parties",
  async fetch() {
    const events: NormalizedEvent[] = [];
    for (const url of EXPLORE_URLS) {
      try {
        events.push(...(await fetchExplore(url)));
      } catch (err) {
        console.warn(`[partiful] ${url} failed:`, (err as Error).message);
      }
    }
    // Trending carousel first so the soft cap never drops Partiful's popular picks.
    events.sort((a, b) => {
      const aTrend = a.tags?.includes("trending") ? 0 : 1;
      const bTrend = b.tags?.includes("trending") ? 0 : 1;
      if (aTrend !== bTrend) return aTrend - bTrend;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });
    return { events: events.slice(0, 120) };
  },
};
