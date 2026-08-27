import {
  FEED_AREAS,
  FEED_CITIES,
  FEED_MODES,
  FEED_TOPICS,
  defaultAreaForCity,
  feedFilterSourcesForCity,
  metroFromArea,
  parseFeedDate,
  parseFeedSources,
  parseFeedTopics,
  type FeedArea,
  type FeedCity,
  type FeedFilterSource,
  type FeedMode,
  type FeedTopic,
} from "@bored/shared";

export type { FeedArea, FeedCity, FeedTopic };

const KEY = "bored:feed";
const VIEW_KEY = "bored:feedView";

export const FEED_VIEWS = ["cards", "large", "list"] as const;
export type FeedView = (typeof FEED_VIEWS)[number];

export function parseFeedView(value: string | null | undefined): FeedView {
  return FEED_VIEWS.includes(value as FeedView)
    ? (value as FeedView)
    : "cards";
}

export function rememberFeedView(view: FeedView) {
  try {
    sessionStorage.setItem(VIEW_KEY, view);
  } catch {
    /* private mode / quota */
  }
}

export function readFeedView(): FeedView {
  try {
    return parseFeedView(sessionStorage.getItem(VIEW_KEY));
  } catch {
    return "cards";
  }
}

export function parseFeedMode(value: string | null | undefined): FeedMode {
  return FEED_MODES.includes(value as FeedMode)
    ? (value as FeedMode)
    : "for_you";
}

export function parseFeedArea(value: string | null | undefined): FeedArea {
  return FEED_AREAS.includes(value as FeedArea)
    ? (value as FeedArea)
    : "bay";
}

export function parseFeedCity(value: string | null | undefined): FeedCity {
  return FEED_CITIES.includes(value as FeedCity)
    ? (value as FeedCity)
    : metroFromArea(parseFeedArea(value));
}

export type FeedPrefs = {
  mode: FeedMode;
  area: FeedArea;
  sources: FeedFilterSource[];
  topics: FeedTopic[];
  /** Selected calendar day when browsing By time (`YYYY-MM-DD`) */
  date: string | null;
};

export function rememberFeedPrefs(
  mode: FeedMode,
  area: FeedArea,
  sources: FeedFilterSource[] = [],
  date: string | null = null,
  topics: FeedTopic[] = [],
) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ mode, area, sources, date, topics }),
    );
  } catch {
    /* private mode / quota */
  }
}

export function readFeedPrefs(): FeedPrefs | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      mode?: string;
      area?: string;
      sources?: string[] | string;
      topics?: string[] | string;
      date?: string | null;
    };
    const area = parseFeedArea(parsed.area);
    const allowed = new Set(feedFilterSourcesForCity(metroFromArea(area)));
    const sources = (
      Array.isArray(parsed.sources)
        ? parseFeedSources(parsed.sources.join(","))
        : parseFeedSources(parsed.sources)
    ).filter((s) => allowed.has(s));
    const topics = (
      Array.isArray(parsed.topics)
        ? parseFeedTopics(parsed.topics.join(","))
        : parseFeedTopics(parsed.topics)
    ).filter((t) => FEED_TOPICS.includes(t));
    const mode = parseFeedMode(parsed.mode);
    return {
      mode,
      area,
      sources,
      topics,
      date: mode === "all" ? parseFeedDate(parsed.date) : null,
    };
  } catch {
    return null;
  }
}

export function feedQueryString(prefs: FeedPrefs): string {
  const params = new URLSearchParams();
  params.set("mode", prefs.mode);
  params.set("area", prefs.area);
  if (prefs.sources.length) {
    params.set("sources", prefs.sources.join(","));
  }
  if (prefs.topics.length) {
    params.set("topics", prefs.topics.join(","));
  }
  if (prefs.mode === "all" && prefs.date) {
    params.set("date", prefs.date);
  }
  return params.toString();
}

export function feedHomeHref(
  mode?: FeedMode,
  area?: FeedArea,
  sources?: FeedFilterSource[],
  date?: string | null,
  topics?: FeedTopic[],
): string {
  const stored = readFeedPrefs();
  const prefs: FeedPrefs = {
    mode: mode ?? stored?.mode ?? "for_you",
    area: area ?? stored?.area ?? defaultAreaForCity("sf"),
    sources: sources ?? stored?.sources ?? [],
    topics: topics ?? stored?.topics ?? [],
    date: date !== undefined ? date : (stored?.date ?? null),
  };
  return `/?${feedQueryString(prefs)}`;
}
