"use client";

import Link from "next/link";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FeedCard, FeedFilterSource, FeedMode, FeedTopic } from "@bored/shared";
import {
  FEED_TOPIC_EMOJI,
  FEED_TOPIC_LABELS,
  FEED_TOPICS,
  areasForCity,
  categoryLabel,
  defaultFeedMode,
  feedFilterSourcesForCity,
  feedModeAllowsDate,
  metroFromArea,
  parseFeedSources,
  parseFeedTopics,
  isHappyHoursHubCard,
  isFeedVideoCard,
  partitionFeedVideoCards,
  withHappyHoursHubCard,
  type FeedCity,
} from "@bored/shared";
import { api, recordFeedSignal } from "@/lib/api";
import {
  trackFeedAreaChanged,
  trackFeedDateChanged,
  trackFeedLoaded,
  trackFeedModeChanged,
  trackFeedSourcesChanged,
  trackFeedTopicChanged,
  trackFeedViewChanged,
  trackDetailOpened,
} from "@/lib/analytics";
import { CityHeroStatus } from "@/components/CityHeroStatus";
import { FeedCardView } from "@/components/FeedCardView";
import { ByTimeFeed } from "@/components/ByTimeFeed";
import { DayStrip } from "@/components/DayStrip";
import { MoviesSection } from "@/components/MoviesSection";
import { FeedViewToggle } from "@/components/FeedViewToggle";
import { VideoReelsCarousel } from "@/components/VideoReelsCarousel";
import { VideoReelsFeed } from "@/components/VideoReelsFeed";
import { SourceFilterMenu } from "@/components/SourceFilterMenu";
import { DetailDrawer } from "@/components/detail/DetailDrawer";
import {
  cardMatchesSelection,
  selectionFromCard,
} from "@/components/detail/selection";
import type { DetailSelection } from "@/components/detail/types";
import { useUser } from "@/components/UserProvider";
import { parseFeedDate, timeZoneForArea, dayCardLabel, dayKey } from "@/lib/datetime";
import {
  defaultCalendarMaxDate,
  feedCalendarMeta,
  type FeedCalendarMeta,
} from "@/lib/feed-calendar";
import {
  fetchFeedCached,
  feedParamsWithVideos,
  feedParamsWithoutTopics,
  peekFeedCache,
} from "@/lib/feed-cache";
import {
  filterCardsByTopics,
  topicNeedsServerEnrich,
  topicsFullyCoveredByAll,
  TOPICS_TO_WARM,
} from "@/lib/topic-feed";
import {
  feedRefreshPhrase,
  gatheringPhraseForArea,
} from "@/lib/gathering-phrase";
import {
  type FeedArea,
  type FeedView,
  areaFromCityPath,
  feedMapHref,
  feedQueryString,
  isFeedCity,
  parseFeedMode,
  readFeedPrefs,
  readFeedView,
  rememberFeedPrefs,
  rememberFeedView,
  topicHubHref,
} from "@/lib/feed-prefs";
import { useSourcesViewEnabled } from "@/lib/dev-flags";
import { useNow } from "@/hooks/useNow";

const MODE_LABELS: Record<FeedMode, string> = {
  for_you: "For you",
  today: "Today",
  weekend: "Weekend",
  date: "Select Date",
};

const AREA_LABELS: Partial<Record<FeedArea, string>> = {
  sf: "All SF",
  bay: "All Bay Area",
  chicago: "Chicago",
  la: "Los Angeles",
};

function toggleTopic(current: FeedTopic[], id: FeedTopic): FeedTopic[] {
  // Single-select: one topic at a time (click again to clear)
  return current.length === 1 && current[0] === id ? [] : [id];
}

function selectionFromParams(
  searchParams: URLSearchParams,
): DetailSelection | null {
  const eventId = searchParams.get("e");
  if (eventId) return { kind: "event", id: eventId };
  const movieId = searchParams.get("m");
  if (movieId) return { kind: "movie", id: movieId };
  return null;
}

function CityFeedInner() {
  const params = useParams<{ city: string }>();
  if (!isFeedCity(params.city)) {
    notFound();
  }
  return <CityFeedCity key={params.city} city={params.city} />;
}

function CityFeedCity({ city }: { city: FeedCity }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialMode = parseFeedMode(searchParams.get("mode"));
  const initialArea = areaFromCityPath(city, searchParams.get("area"));
  const initialSources = parseFeedSources(searchParams.get("sources")).filter(
    (s) => feedFilterSourcesForCity(city).includes(s),
  );
  const initialTopics = parseFeedTopics(searchParams.get("topics"));
  const initialTz = timeZoneForArea(initialArea);
  const initialDate =
    initialMode === "today"
      ? dayKey(new Date(), initialTz)
      : feedModeAllowsDate(initialMode)
        ? parseFeedDate(searchParams.get("date"))
        : null;

  const [mode, setMode] = useState<FeedMode>(initialMode);
  const [area, setArea] = useState<FeedArea>(initialArea);
  const [sources, setSources] = useState<FeedFilterSource[]>(initialSources);
  const [topics, setTopics] = useState<FeedTopic[]>(initialTopics);
  const [date, setDate] = useState<string | null>(initialDate);
  const [calendarMeta, setCalendarMeta] = useState<FeedCalendarMeta | null>(
    null,
  );
  const [feedView, setFeedView] = useState<FeedView>("large");
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [videoCards, setVideoCards] = useState<FeedCard[]>([]);
  const [prefsSummary, setPrefsSummary] = useState<{
    interests: string[];
    neighborhoods: string[];
    budgetMax: number | null;
    budgetEnabled?: boolean;
    budgetTier?: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [prefsHydrated, setPrefsHydrated] = useState(() =>
    searchParams.has("mode"),
  );
  const lastFeedRefreshKey = useRef<number | null>(null);

  const { ready: userReady, authenticated, onboardingComplete } = useUser();

  const cityAreas = areasForCity(city);
  const citySources = feedFilterSourcesForCity(city);
  const sourcesViewEnabled = useSourcesViewEnabled();
  const timeZone = timeZoneForArea(area);
  const now = useNow();

  const selection = useMemo(
    () => selectionFromParams(searchParams),
    [searchParams],
  );

  const syncUrl = useCallback(
    (
      nextMode: FeedMode,
      nextArea: FeedArea,
      nextSources: FeedFilterSource[],
      nextDate: string | null = date,
      nextSelection: DetailSelection | null = selection,
      nextTopics: FeedTopic[] = topics,
    ) => {
      const tz = timeZoneForArea(nextArea);
      const resolvedDate =
        nextMode === "today"
          ? (nextDate ?? dayKey(new Date(), tz))
          : feedModeAllowsDate(nextMode)
            ? nextDate
            : null;
      rememberFeedPrefs(
        nextMode,
        nextArea,
        nextSources,
        resolvedDate,
        nextTopics,
      );
      const pathCity = metroFromArea(nextArea);
      const q = feedQueryString({
        mode: nextMode,
        area: nextArea,
        sources: nextSources,
        topics: nextTopics,
        date: resolvedDate,
      });
      const params = new URLSearchParams(q);
      if (nextSelection?.kind === "event") params.set("e", nextSelection.id);
      if (nextSelection?.kind === "movie") params.set("m", nextSelection.id);
      const qs = params.toString();
      router.replace(qs ? `/${pathCity}?${qs}` : `/${pathCity}`, {
        scroll: false,
      });
    },
    [router, selection, date, topics],
  );

  const openDetail = useCallback(
    (card: FeedCard) => {
      if (isHappyHoursHubCard(card)) {
        const next: FeedTopic[] = ["happy_hours"];
        setTopics(next);
        trackFeedTopicChanged({ topics: next, city, surface: "feed" });
        setSources([]);
        syncUrl(mode, area, [], date, selection, next);
        return;
      }
      const next = selectionFromCard(card);
      trackDetailOpened({
        kind: next.kind,
        id: next.id,
        surface: "feed",
      });
      if (isFeedVideoCard(card) && next.kind === "event") {
        recordFeedSignal({
          targetKind: "event",
          targetId: next.id,
          type: "opened",
        });
      }
      syncUrl(mode, area, sources, date, next);
    },
    [syncUrl, mode, area, sources, date, selection, city],
  );

  const closeDetail = useCallback(() => {
    syncUrl(mode, area, sources, date, null);
  }, [syncUrl, mode, area, sources, date]);

  const selectMode = useCallback(
    (nextMode: FeedMode) => {
      const nextDate =
        nextMode === "today" ? dayKey(new Date(), timeZone) : null;
      setMode(nextMode);
      setDate(nextDate);
      trackFeedModeChanged({ mode: nextMode, city, area });
      syncUrl(nextMode, area, sources, nextDate);
    },
    [city, area, sources, timeZone, syncUrl],
  );

  const selectDay = useCallback(
    (nextDate: string | null) => {
      const nextMode = mode === "weekend" ? "weekend" : "date";
      setDate(nextDate);
      setMode(nextMode);
      trackFeedDateChanged({ date: nextDate, mode: nextMode, city });
      syncUrl(nextMode, area, sources, nextDate);
    },
    [mode, city, area, sources, syncUrl],
  );

  // Keep area/sources in sync when the path city or ?area= changes.
  // Do not depend on the full searchParams object — opening/closing detail
  // only toggles ?e= / ?m= and must not recreate `sources` (new array → refetch).
  const areaParam = searchParams.get("area");
  useEffect(() => {
    const next = areaFromCityPath(city, areaParam);
    setArea((prev) => (prev === next ? prev : next));
    const allowed = new Set(feedFilterSourcesForCity(city));
    setSources((prev) => {
      const filtered = prev.filter((s) => allowed.has(s));
      if (
        filtered.length === prev.length &&
        filtered.every((s, i) => s === prev[i])
      ) {
        return prev;
      }
      return filtered;
    });
  }, [city, areaParam]);

  // Restore area/sources/topics when landing without ?mode=; always Today.
  useEffect(() => {
    if (searchParams.has("mode")) {
      setPrefsHydrated(true);
      return;
    }

    const nextMode = defaultFeedMode();
    const stored = readFeedPrefs();
    if (stored && metroFromArea(stored.area) === city) {
      const nextArea = searchParams.has("area")
        ? areaFromCityPath(city, searchParams.get("area"))
        : stored.area === "sf" || stored.area === "bay"
          ? stored.area
          : areaFromCityPath(city, null);
      const nextSources = sourcesViewEnabled ? stored.sources : sources;
      const nextTopics = stored.topics;
      const nextDate = dayKey(new Date(), timeZoneForArea(nextArea));
      setMode(nextMode);
      setArea(nextArea);
      if (sourcesViewEnabled) {
        setSources(stored.sources);
      }
      setTopics(nextTopics);
      setDate(nextDate);
      syncUrl(
        nextMode,
        nextArea,
        nextSources,
        nextDate,
        selectionFromParams(searchParams),
        nextTopics,
      );
      setPrefsHydrated(true);
      return;
    }

    const nextDate = dayKey(new Date(), timeZone);
    setMode(nextMode);
    setDate(nextDate);
    syncUrl(
      nextMode,
      area,
      sources,
      nextDate,
      selectionFromParams(searchParams),
      topics,
    );
    setPrefsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, searchParams, sourcesViewEnabled]);

  useEffect(() => {
    setFeedView(readFeedView());
  }, []);

  const selectFeedView = useCallback((next: FeedView) => {
    setFeedView(next);
    rememberFeedView(next);
    trackFeedViewChanged({ view: next });
  }, []);

  useEffect(() => {
    if (!searchParams.has("mode")) return;
    rememberFeedPrefs(
      mode,
      area,
      sources,
      feedModeAllowsDate(mode) ? date : null,
      topics,
    );
  }, [mode, area, sources, topics, date, searchParams]);

  useEffect(() => {
    void api<{
      onboardingComplete: boolean;
      prefs: {
        interests: { category: string; weight: number }[];
        neighborhoods: string[];
        budgetMax: number | null;
        budgetEnabled?: boolean;
        budgetTier?: number | null;
      };
    }>("/v1/me")
      .then((me) => {
        setPrefsSummary({
          interests: me.prefs.interests.map((i) => i.category),
          neighborhoods: me.prefs.neighborhoods,
          budgetMax: me.prefs.budgetMax,
          budgetEnabled: me.prefs.budgetEnabled,
          budgetTier: me.prefs.budgetTier,
        });
      })
      .catch(() => {
        /* ignore */
      });
  }, [refreshKey]);

  useEffect(() => {
    if (!prefsHydrated) return;
    if (mode !== "weekend" && mode !== "date") {
      setCalendarMeta(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      mode: "date",
      area,
      limit: "500",
    });
    if (sources.length) params.set("sources", sources.join(","));
    if (topics.length) params.set("topics", topics.join(","));
    void api<{ cards: FeedCard[] }>(`/v1/feed?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setCalendarMeta(feedCalendarMeta(data.cards, timeZone));
      })
      .catch(() => {
        if (!cancelled) setCalendarMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [prefsHydrated, mode, area, sources, topics, timeZone, refreshKey]);

  useEffect(() => {
    if (!prefsHydrated) return;
    let cancelled = false;
    const effectiveDate =
      mode === "today" ? (date ?? dayKey(new Date(), timeZone)) : date;
    const overviewFetch = mode === "date" && !effectiveDate;
    const limit = overviewFetch
      ? 500
      : mode === "date" || effectiveDate || sources.length
        ? 200
        : 40;
    const params = new URLSearchParams({
      mode,
      area,
      limit: String(limit),
    });
    if (sources.length) params.set("sources", sources.join(","));
    if (topics.length) params.set("topics", topics.join(","));
    if (effectiveDate) params.set("date", effectiveDate);

    const force =
      lastFeedRefreshKey.current !== null &&
      lastFeedRefreshKey.current !== refreshKey;
    lastFeedRefreshKey.current = refreshKey;

    // Today / For you: paint events as soon as ready; reels load in parallel.
    // Source browsing IG/YT keeps the monolithic path so IMAGE tips stay.
    const splitVideos =
      (mode === "today" || mode === "for_you") &&
      !sources.includes("instagram") &&
      !sources.includes("youtube");

    setError(null);

    if (!splitVideos) {
      const cached = force ? null : peekFeedCache(params);
      if (cached) {
        setCards(cached);
        setVideoCards([]);
        if (overviewFetch) {
          setCalendarMeta(feedCalendarMeta(cached, timeZone));
        }
        setLoading(false);
        setReelsLoading(false);
      } else {
        setLoading(true);
        setReelsLoading(false);
      }

      void fetchFeedCached(params, { force })
        .then((data) => {
          if (cancelled) return;
          setCards(data.cards);
          setVideoCards([]);
          if (overviewFetch) {
            setCalendarMeta(feedCalendarMeta(data.cards, timeZone));
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setReelsLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const eventsParams = feedParamsWithVideos(params, "exclude");
    const videosParams = feedParamsWithVideos(params, "only");
    const allEventsParams = feedParamsWithVideos(
      feedParamsWithoutTopics(params),
      "exclude",
    );

    // Optimistic topic paint: filter warm All cache so dense chips feel instant.
    const allCached =
      !force && topics.length > 0 ? peekFeedCache(allEventsParams) : null;
    const optimistic =
      allCached && topics.length > 0
        ? filterCardsByTopics(allCached, topics)
        : null;
    const denseFromAll =
      Boolean(optimistic) &&
      topicsFullyCoveredByAll(topics) &&
      (optimistic?.length ?? 0) > 0;
    const needsEnrich =
      topics.length > 0 &&
      (topicNeedsServerEnrich(topics) ||
        !optimistic ||
        optimistic.length === 0);

    const cachedEvents = force ? null : peekFeedCache(eventsParams);
    const cachedVideos = force ? null : peekFeedCache(videosParams);

    if (cachedEvents) {
      setCards(cachedEvents);
      setLoading(false);
    } else if (optimistic && optimistic.length > 0) {
      setCards(optimistic);
      // Soft refresh (isRefreshing) when curated extras may still arrive.
      setLoading(needsEnrich && !denseFromAll);
    } else {
      // Empty topic (e.g. happy_hours) — don't leave the previous All list up.
      if (topics.length > 0) setCards([]);
      setLoading(true);
    }

    const skipVideosFetch = denseFromAll && !needsEnrich;
    if (cachedVideos) {
      setVideoCards(cachedVideos);
      setReelsLoading(false);
    } else if (skipVideosFetch) {
      // Keep prior reels; dense calendar topics don't need a topic-scoped reel refetch.
      setReelsLoading(false);
    } else {
      setReelsLoading(true);
    }

    const skipEventsFetch = denseFromAll && !needsEnrich && !force;

    if (!skipEventsFetch) {
      void fetchFeedCached(eventsParams, { force })
        .then((data) => {
          if (cancelled) return;
          setCards(data.cards);
        })
        .catch((err: Error) => {
          if (!cancelled && !optimistic?.length) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    if (!skipVideosFetch) {
      void fetchFeedCached(videosParams, { force })
        .then((data) => {
          if (cancelled) return;
          setVideoCards(data.cards);
        })
        .catch(() => {
          if (!cancelled) setVideoCards([]);
        })
        .finally(() => {
          if (!cancelled) setReelsLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [prefsHydrated, mode, area, sources, topics, date, timeZone, refreshKey]);

  // Warm For you + expensive topic feeds after Today All paints.
  useEffect(() => {
    if (!prefsHydrated) return;
    if (mode !== "today") return;
    if (loading) return;
    if (topics.length > 0) return;
    if (sources.length > 0) return;

    let cancelled = false;
    const effectiveDate = date ?? dayKey(new Date(), timeZone);
    const base = new URLSearchParams({
      mode: "today",
      area,
      limit: "200",
      date: effectiveDate,
      videos: "exclude",
    });

    const run = () => {
      if (cancelled) return;

      // Curated-heavy topics — first chip click becomes a cache hit.
      for (const topic of TOPICS_TO_WARM) {
        const eventsParams = new URLSearchParams(base);
        eventsParams.set("topics", topic);
        void fetchFeedCached(eventsParams).catch(() => {});
        if (topic === "food" || topic === "happy_hours") {
          const videosParams = feedParamsWithVideos(eventsParams, "only");
          void fetchFeedCached(videosParams).catch(() => {});
        }
      }

      if (!userReady || !authenticated || !onboardingComplete) return;
      const forYou = new URLSearchParams({
        mode: "for_you",
        area,
        limit: "40",
        videos: "exclude",
      });
      void fetchFeedCached(forYou).catch(() => {});
      void fetchFeedCached(feedParamsWithVideos(forYou, "only")).catch(() => {});
    };

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(run, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(run, 0);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [
    prefsHydrated,
    userReady,
    authenticated,
    onboardingComplete,
    mode,
    area,
    sources,
    topics,
    date,
    timeZone,
    loading,
    refreshKey,
  ]);

  // Fire once per successful fetch (when loading flips false), not on view toggles.
  const wasFeedLoading = useRef(false);
  useEffect(() => {
    if (loading) {
      wasFeedLoading.current = true;
      return;
    }
    if (!prefsHydrated || !wasFeedLoading.current) return;
    wasFeedLoading.current = false;
    trackFeedLoaded({
      city,
      mode,
      area,
      card_count: cards.length,
      topics,
      sources,
      view: feedView,
    });
  }, [
    prefsHydrated,
    loading,
    city,
    mode,
    area,
    cards.length,
    topics,
    sources,
    feedView,
  ]);

  const effectiveDate =
    mode === "today" ? (date ?? dayKey(new Date(), timeZone)) : date;

  const browsingToday =
    mode === "today" &&
    effectiveDate === dayKey(now, timeZone);

  const displayCards = useMemo(
    () =>
      withHappyHoursHubCard(cards, {
        city,
        now,
        timeZone,
        mode,
        topics,
        browsingToday,
      }),
    [cards, city, now, timeZone, mode, topics, browsingToday],
  );

  const movies = displayCards.filter((c) => c.kind === "movie_showtime");

  const splitVideosActive =
    (mode === "for_you" || mode === "today") &&
    !sources.includes("instagram") &&
    !sources.includes("youtube");

  const { videos: partitionedReels, rest: cardsWithoutReels } = useMemo(
    () => partitionFeedVideoCards(displayCards),
    [displayCards],
  );
  const reelCards = splitVideosActive ? videoCards : partitionedReels;
  const showReelsCarousel =
    (mode === "for_you" || mode === "today") && feedView !== "reels";
  const feedCards = feedView === "reels"
    ? splitVideosActive
      ? videoCards
      : displayCards
    : cardsWithoutReels;

  // Movies near you only when the Movies topic is on — don't lead For you /
  // Weekend with showtimes before organic picks.
  const moviesTopicActive = topics.includes("movies");
  const moviesSectionEligible =
    mode === "for_you" || (mode === "weekend" && !date);
  const showMoviesSection =
    movies.length > 0 && moviesTopicActive && moviesSectionEligible;
  const mainCards =
    moviesSectionEligible && !moviesTopicActive
      ? feedCards.filter((c) => c.kind !== "movie_showtime")
      : feedCards;
  const mainEvents = mainCards.filter((c) => c.kind === "event");

  const allUpcomingLabel =
    area === "chicago"
      ? "All upcoming in Chicago"
      : area === "sf"
        ? "All upcoming in SF"
        : "All upcoming in the Bay";

  const selectedDay = useMemo(
    () => (effectiveDate ? dayCardLabel(effectiveDate, timeZone) : null),
    [effectiveDate, timeZone],
  );

  const chronologicalBrowse =
    mode === "today" ||
    mode === "date" ||
    (mode === "weekend" && Boolean(effectiveDate));

  const useByTimeLayout =
    feedView === "by_time" ||
    (chronologicalBrowse && feedView !== "poster" && feedView !== "reels");

  const useReelsLayout = feedView === "reels";

  const calendarBounds = useMemo(() => {
    const minDate = calendarMeta?.minDate ?? dayKey(new Date(), timeZone);
    const maxDate =
      calendarMeta?.maxDate ?? defaultCalendarMaxDate(minDate);
    return {
      daysWithEvents: calendarMeta?.daysWithEvents ?? new Set<string>(),
      minDate,
      maxDate,
    };
  }, [calendarMeta, timeZone]);

  const sectionTitle = (() => {
    if (feedView === "reels") return "Reels & shorts";
    if (mode === "for_you") return "Picked for you";
    if (mode === "today") {
      return selectedDay ? (
        <>
          Today{" "}
          <span className="section-title__day">{selectedDay.weekdayLong}</span>
        </>
      ) : (
        "Today"
      );
    }
    if (selectedDay) {
      return selectedDay.isToday ? (
        <>
          Today{" "}
          <span className="section-title__day">{selectedDay.weekdayLong}</span>
        </>
      ) : (
        <>
          <span className="section-title__day">{selectedDay.weekdayLong}</span>
          {" · "}
          {selectedDay.dateLine}
        </>
      );
    }
    if (mode === "weekend") return "Weekend";
    if (mode === "date") return allUpcomingLabel;
    return MODE_LABELS[mode];
  })();

  // Keep prior cards visible while filters refetch, but mark them stale so the
  // active chip and feed content don't feel out of sync (esp. on mobile).
  const isRefreshing = loading && cards.length > 0;

  return (
    <div className={`feed-layout ${selection ? "has-detail" : ""}`}>
      <div className="feed-main">
        <CityHeroStatus
          city={city}
          area={area}
          timeZone={timeZone}
          mode={mode}
          selectedDate={mode === "weekend" || mode === "date" ? date : null}
        >
          {mode === "for_you" &&
            prefsSummary &&
            prefsSummary.interests.length > 0 && (
              <p className="feed-tastes-line">
                <span className="feed-tastes-line__chips">
                  {prefsSummary.interests.slice(0, 6).map((c) => (
                    <span key={c} className="feed-taste-chip">
                      {categoryLabel(c)}
                    </span>
                  ))}
                  {prefsSummary.interests.length > 6
                    ? ` +${prefsSummary.interests.length - 6}`
                    : null}
                </span>
                <Link href="/onboarding" className="feed-tastes-line__edit">
                  Edit tastes
                </Link>
              </p>
            )}
          {mode === "today" &&
            userReady &&
            (!authenticated || !onboardingComplete) && (
              <p className="feed-tastes-nudge">
                {authenticated && !onboardingComplete
                  ? "Set tastes for a feed that fits you."
                  : "Browsing Today — "}
                <Link href="/onboarding">
                  {authenticated && !onboardingComplete
                    ? "Set tastes"
                    : "Set tastes for For you"}
                </Link>
              </p>
            )}
        </CityHeroStatus>

        <div className="feed-filters">
          {cityAreas.length > 1 && (
            <nav className="nav" aria-label="Area">
              {cityAreas.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`chip ${area === id ? "active" : ""}`}
                  onClick={() => {
                    setArea(id);
                    trackFeedAreaChanged({ area: id, city });
                    syncUrl(mode, id, sources, date);
                  }}
                >
                  {AREA_LABELS[id] ?? id}
                </button>
              ))}
            </nav>
          )}

          <nav className="nav" aria-label="Feed mode">
            {(Object.keys(MODE_LABELS) as FeedMode[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${mode === id ? "active" : ""}`}
                onClick={() => selectMode(id)}
              >
                {MODE_LABELS[id]}
              </button>
            ))}
          </nav>

          {(mode === "weekend" || mode === "date") && (
            <DayStrip
              timeZone={timeZone}
              selectedDate={date}
              daysWithEvents={calendarBounds.daysWithEvents}
              minDate={calendarBounds.minDate}
              maxDate={calendarBounds.maxDate}
              onSelect={selectDay}
              highlightWeekend={mode === "weekend"}
              showAllDays={mode === "date"}
              showCalendar={mode === "date"}
            />
          )}

          <nav
            className={`nav nav--topics${isRefreshing ? " is-busy" : ""}`}
            aria-label="Topics"
            aria-busy={isRefreshing}
          >
            <button
              type="button"
              className={`chip ${topics.length === 0 ? "active" : ""}`}
              onClick={() => {
                setTopics([]);
                trackFeedTopicChanged({ topics: [], city, surface: "feed" });
                syncUrl(mode, area, sources, date, selection, []);
              }}
            >
              All
            </button>
            {FEED_TOPICS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${topics.includes(id) ? "active" : ""}`}
                onClick={() => {
                  const next = toggleTopic(topics, id);
                  setTopics(next);
                  trackFeedTopicChanged({
                    topics: next,
                    city,
                    surface: "feed",
                  });
                  // Topics replace source browsing — clear any QA ?sources=
                  setSources([]);
                  syncUrl(mode, area, [], date, selection, next);
                }}
              >
                <span aria-hidden>{FEED_TOPIC_EMOJI[id]}</span>{" "}
                {FEED_TOPIC_LABELS[id]}
              </button>
            ))}
          </nav>

          {sourcesViewEnabled && (
            <SourceFilterMenu
              options={citySources}
              selected={sources}
              onChange={(next) => {
                setSources(next);
                trackFeedSourcesChanged({ sources: next, city });
                syncUrl(mode, area, next, date);
              }}
            />
          )}
        </div>

        {error && (
          <p className="muted" style={{ marginTop: 16 }}>
            Can&apos;t reach API ({error}). Is `pnpm dev:api` running on :4000?
          </p>
        )}

        {loading && cards.length === 0 && (
          <p className="muted">{gatheringPhraseForArea(area)}</p>
        )}

        {!error && (!loading || cards.length > 0) && (
          <div className="feed-results-shell">
            {isRefreshing && (
              <p
                className="feed-refresh-status"
                role="status"
                aria-live="polite"
              >
                <span className="feed-refresh-status__spinner" aria-hidden />
                {feedRefreshPhrase(area, topics)}
              </p>
            )}
            <div
              className={`feed-results${isRefreshing ? " is-refreshing" : ""}`}
              aria-busy={isRefreshing}
            >
            {showMoviesSection && (
              <MoviesSection
                movies={movies}
                selected={selection}
                onSelect={openDetail}
                timeZone={timeZone}
              />
            )}

            {showReelsCarousel && (reelCards.length > 0 || reelsLoading) && (
              <VideoReelsCarousel
                cards={reelCards}
                loading={reelsLoading && reelCards.length === 0}
                onSelect={openDetail}
                isSelected={(card) => cardMatchesSelection(card, selection)}
              />
            )}

            <section>
              <div className="section-title-row">
                <h2 className="section-title">{sectionTitle}</h2>
                <div className="section-title-row__actions">
                  <Link
                    href={feedMapHref(mode, area, sources, date)}
                    className="feed-map-link"
                  >
                    Map
                  </Link>
                  <FeedViewToggle value={feedView} onChange={selectFeedView} />
                </div>
              </div>
              {mainCards.length === 0 &&
                !showMoviesSection &&
                !(showReelsCarousel && (reelCards.length > 0 || reelsLoading)) && (
                <p className="muted">
                  Nothing in this view — try All topics
                  {sourcesViewEnabled ? " and All sources" : ""}
                  {mode !== "date" ? ", pick Select Date" : ""}
                  {city === "sf" ? ", widen to Bay Area, " : ", "}
                  {moviesTopicActive && city === "chicago"
                    ? " (movies are SF-only for now), "
                    : ""}
                  or <Link href="/onboarding">update tastes</Link>.
                </p>
              )}
              {useReelsLayout ? (
                reelsLoading && mainCards.length === 0 ? (
                  <VideoReelsCarousel
                    cards={[]}
                    loading
                    skeletonCount={10}
                    onSelect={openDetail}
                    isSelected={() => false}
                  />
                ) : (
                  <VideoReelsFeed
                    cards={mainCards}
                    onSelect={openDetail}
                    isSelected={(card) => cardMatchesSelection(card, selection)}
                  />
                )
              ) : useByTimeLayout ? (
                <ByTimeFeed
                  cards={mainCards}
                  timeZone={timeZone}
                  onSelect={openDetail}
                  isSelected={(card) => cardMatchesSelection(card, selection)}
                  hideDayHeadings={
                    mode === "today" || Boolean(effectiveDate)
                  }
                  collapseEarlier={Boolean(selectedDay?.isToday)}
                  sourceFilter={sources}
                  variant={feedView === "by_time" ? "text" : "large"}
                />
              ) : (
                <div
                  className={[
                    "feed-grid",
                    feedView === "large" ? "feed-grid--large" : "",
                    feedView === "poster" ? "feed-grid--poster" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {(chronologicalBrowse ? mainCards : mainEvents).map((card, i) => (
                    <FeedCardView
                      key={`${card.id}:${card.startsAt}`}
                      card={card}
                      selected={cardMatchesSelection(card, selection)}
                      onSelect={openDetail}
                      timeZone={timeZone}
                      size={
                        feedView === "large"
                          ? "large"
                          : feedView === "poster"
                            ? "poster"
                            : "default"
                      }
                      style={{ animationDelay: `${i * 40}ms` }}
                    />
                  ))}
                </div>
              )}
            </section>

            <p className="muted" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                Refresh feed
              </button>
            </p>
            </div>
          </div>
        )}

        <nav className="feed-topic-hubs" aria-label="Topic pages">
          <p className="feed-topic-hubs__label">Topic pages</p>
          <ul className="feed-topic-hubs__list">
            {FEED_TOPICS.map((id) => (
              <li key={id}>
                <Link href={topicHubHref(city, id)}>
                  {FEED_TOPIC_LABELS[id]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {selection && (
        <DetailDrawer
          selection={selection}
          onClose={closeDetail}
          reelPlaylist={reelCards}
        />
      )}
    </div>
  );
}

export default function CityFeedPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <CityFeedInner />
    </Suspense>
  );
}
