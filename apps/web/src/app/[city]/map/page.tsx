"use client";

import Link from "next/link";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { FeedCard, FeedFilterSource, FeedMode, FeedTopic } from "@bored/shared";
import {
  FEED_CITY_LABELS,
  feedFilterSourcesForCity,
  feedModeAllowsDate,
  filterTodayFeedVisible,
  isHappyHoursHubCard,
  matchesAnyFeedTopic,
  withHappyHoursHubCard,
  metroFromArea,
  parseFeedSources,
  topicsPresentInCards,
  type FeedCity,
} from "@bored/shared";
import {
  trackDetailOpened,
  trackFeedDateChanged,
  trackFeedModeChanged,
  trackFeedTopicChanged,
  trackMapOpened,
} from "@/lib/analytics";
import { MapDateControl } from "@/components/map/MapDateControl";
import { MapEventSidebar } from "@/components/map/MapEventSidebar";
import { MapEventsMap } from "@/components/map/MapEventsMap";
import { MapTopicCarousel } from "@/components/map/MapTopicCarousel";
import { selectionFromCard } from "@/components/detail/selection";
import type { DetailSelection } from "@/components/detail/types";
import { parseFeedDate, timeZoneForArea, dayKey } from "@/lib/datetime";
import {
  defaultCalendarMaxDate,
  feedCalendarMeta,
  type FeedCalendarMeta,
} from "@/lib/feed-calendar";
import { gatheringPhraseForArea, mapLoadingPhrase } from "@/lib/gathering-phrase";
import {
  areaFromCityPath,
  feedHomeHref,
  feedHomeHrefExplicit,
  feedQueryString,
  isFeedCity,
  parseFeedMode,
  readFeedPrefs,
  rememberFeedPrefs,
  type FeedArea,
} from "@/lib/feed-prefs";
import {
  FEED_ALL_EVENTS_LIMIT,
  FEED_MAP_TOPUP_LIMIT,
  feedAllEventsParams,
  fetchFeedCached,
  mergeFeedCardsById,
  peekFeedCache,
} from "@/lib/feed-cache";
import { useSourcesViewEnabled } from "@/lib/dev-flags";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useNow } from "@/hooks/useNow";

function selectionFromParams(
  searchParams: URLSearchParams,
): DetailSelection | null {
  const eventId = searchParams.get("e");
  if (eventId) return { kind: "event", id: eventId };
  const movieId = searchParams.get("m");
  if (movieId) return { kind: "movie", id: movieId };
  return null;
}

function toggleTopic(current: FeedTopic[], id: FeedTopic): FeedTopic[] {
  return current.length === 1 && current[0] === id ? [] : [id];
}

function CityMapInner() {
  const params = useParams<{ city: string }>();
  if (!isFeedCity(params.city)) {
    notFound();
  }
  return <CityMapPage key={params.city} city={params.city} />;
}

function CityMapPage({ city }: { city: FeedCity }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialArea = areaFromCityPath(city, searchParams.get("area"));
  const initialTz = timeZoneForArea(initialArea);
  const todayKey = dayKey(new Date(), initialTz);
  // Map defaults to Today unless the URL already specifies a mode.
  const initialMode = searchParams.has("mode")
    ? parseFeedMode(searchParams.get("mode"))
    : "today";
  const initialSources = parseFeedSources(searchParams.get("sources")).filter(
    (s) => feedFilterSourcesForCity(city).includes(s),
  );
  const initialDate =
    initialMode === "today"
      ? todayKey
      : feedModeAllowsDate(initialMode)
        ? parseFeedDate(searchParams.get("date"))
        : null;

  const [mode, setMode] = useState<FeedMode>(initialMode);
  const [area, setArea] = useState<FeedArea>(initialArea);
  const [sources, setSources] = useState<FeedFilterSource[]>(initialSources);
  const [topics, setTopics] = useState<FeedTopic[]>([]);
  const [date, setDate] = useState<string | null>(initialDate);
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapFilterIds, setMapFilterIds] = useState<string[] | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calendarMeta, setCalendarMeta] = useState<FeedCalendarMeta | null>(
    null,
  );
  const [prefsHydrated, setPrefsHydrated] = useState(() =>
    searchParams.has("mode"),
  );
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const sourcesViewEnabled = useSourcesViewEnabled();
  const now = useNow();

  const timeZone = timeZoneForArea(area);
  const selection = useMemo(
    () => selectionFromParams(searchParams),
    [searchParams],
  );

  useEffect(() => {
    trackMapOpened({ city, area });
    // Once per map mount for this city
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

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
        readFeedPrefs()?.topics ?? [],
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
      router.replace(qs ? `/${pathCity}/map?${qs}` : `/${pathCity}/map`, {
        scroll: false,
      });
    },
    [router, selection, date, topics],
  );

  useEffect(() => {
    const next = areaFromCityPath(city, searchParams.get("area"));
    setArea((prev) => (prev === next ? prev : next));
  }, [city, searchParams]);

  useEffect(() => {
    if (searchParams.has("mode")) {
      setPrefsHydrated(true);
      return;
    }
    const stored = readFeedPrefs();
    const tz = timeZoneForArea(area);
    const today = dayKey(new Date(), tz);
    if (stored && metroFromArea(stored.area) === city) {
      const nextArea = searchParams.has("area")
        ? areaFromCityPath(city, searchParams.get("area"))
        : stored.area === "sf" || stored.area === "bay"
          ? stored.area
          : areaFromCityPath(city, null);
      // Map always opens on Today; keep area/sources from prefs, not feed topics.
      setMode("today");
      setArea(nextArea);
      if (sourcesViewEnabled) {
        setSources(stored.sources);
      }
      setTopics([]);
      setDate(today);
      syncUrl(
        "today",
        nextArea,
        sourcesViewEnabled ? stored.sources : sources,
        today,
        selectionFromParams(searchParams),
        [],
      );
    } else {
      syncUrl(
        "today",
        area,
        sources,
        today,
        selectionFromParams(searchParams),
        topics,
      );
    }
    setPrefsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, searchParams, sourcesViewEnabled]);

  // Paint from home All-events cache when possible; top up only if that set looks capped.
  // Topics stay client-side (see feedMapHref) so chip toggles don't refetch.
  useEffect(() => {
    if (!prefsHydrated) return;
    let cancelled = false;
    const effectiveDate =
      mode === "today" ? (date ?? dayKey(new Date(), timeZone)) : date;
    const primary = feedAllEventsParams({
      mode,
      area,
      sources,
      date: effectiveDate,
      limit: FEED_ALL_EVENTS_LIMIT,
    });

    const cached = peekFeedCache(primary);
    if (cached?.length) {
      setCards(cached);
      // Soft refresh only when we may still need a denser top-up.
      setLoading(cached.length >= FEED_ALL_EVENTS_LIMIT);
    } else {
      setLoading(true);
    }
    setError(null);

    void (async () => {
      try {
        const { cards: primaryCards } = await fetchFeedCached(primary);
        if (cancelled) return;
        setCards(primaryCards);

        if (primaryCards.length < FEED_ALL_EVENTS_LIMIT) {
          setLoading(false);
          return;
        }

        setLoading(true);
        const topUp = feedAllEventsParams({
          mode,
          area,
          sources,
          date: effectiveDate,
          limit: FEED_MAP_TOPUP_LIMIT,
        });
        const { cards: more } = await fetchFeedCached(topUp);
        if (cancelled) return;
        setCards(mergeFeedCardsById(primaryCards, more));
      } catch (err) {
        if (cancelled) return;
        if (!cached?.length) {
          setError(err instanceof Error ? err.message : "Failed to load feed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prefsHydrated, mode, area, sources, date, timeZone]);

  // Calendar dots for the date picker (overview horizon).
  useEffect(() => {
    if (!prefsHydrated) return;
    let cancelled = false;
    const params = new URLSearchParams({
      mode: "date",
      area,
      limit: "500",
    });
    if (sources.length) params.set("sources", sources.join(","));
    void fetchFeedCached(params)
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
  }, [prefsHydrated, area, sources, timeZone]);

  // Deep-linked detail on mobile should open the sheet.
  useEffect(() => {
    if (selection && !isDesktop) setSheetOpen(true);
  }, [selection, isDesktop]);

  // Clear pin/cluster filter when the date window changes.
  useEffect(() => {
    setMapFilterIds(null);
    setSelectedClusterId(null);
  }, [mode, date]);

  const isBrowsingToday = useMemo(() => {
    const today = dayKey(now, timeZone);
    const effectiveDate = date ?? today;
    return mode === "today" && effectiveDate === today;
  }, [mode, date, timeZone, now]);

  const dateFilteredCards = useMemo(() => {
    if (!isBrowsingToday) return cards;
    return filterTodayFeedVisible(cards, now);
  }, [cards, isBrowsingToday, now]);

  const hubbedCards = useMemo(
    () =>
      withHappyHoursHubCard(dateFilteredCards, {
        city,
        now,
        timeZone,
        mode,
        topics,
        browsingToday: isBrowsingToday,
      }),
    [dateFilteredCards, city, now, timeZone, mode, topics, isBrowsingToday],
  );

  const topicFilteredCards = useMemo(() => {
    if (!topics.length) return hubbedCards;
    return hubbedCards.filter((c) => matchesAnyFeedTopic(topics, c));
  }, [hubbedCards, topics]);

  const presentTopics = useMemo(() => {
    const present = topicsPresentInCards(hubbedCards);
    const extra = topics.filter((t) => !present.includes(t));
    return extra.length ? [...present, ...extra] : present;
  }, [hubbedCards, topics]);

  const visibleCards = useMemo(() => {
    if (!mapFilterIds) return topicFilteredCards;
    const allowed = new Set(mapFilterIds);
    return topicFilteredCards.filter((c) => allowed.has(c.id));
  }, [topicFilteredCards, mapFilterIds]);

  // Map always shows the full topic-filtered set so clusters stay put.
  const mapCards = useMemo(
    () =>
      topicFilteredCards.filter(
        (c) =>
          typeof c.lat === "number" &&
          typeof c.lng === "number" &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng),
      ),
    [topicFilteredCards],
  );

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

  const openDetail = useCallback(
    (card: FeedCard) => {
      if (isHappyHoursHubCard(card)) {
        const next: FeedTopic[] = ["happy_hours"];
        setTopics(next);
        setMapFilterIds(null);
        setSelectedClusterId(null);
        trackFeedTopicChanged({ topics: next, city, surface: "map" });
        syncUrl(mode, area, sources, date, selection, next);
        return;
      }
      if (!isDesktop) setSheetOpen(true);
      const next = selectionFromCard(card);
      trackDetailOpened({
        kind: next.kind,
        id: next.id,
        surface: "map",
      });
      syncUrl(mode, area, sources, date, next);
    },
    [syncUrl, mode, area, sources, date, isDesktop],
  );

  const closeDetail = useCallback(() => {
    syncUrl(mode, area, sources, date, null);
  }, [syncUrl, mode, area, sources, date]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setMapFilterIds(null);
    setSelectedClusterId(null);
    syncUrl(mode, area, sources, date, null);
  }, [syncUrl, mode, area, sources, date]);

  const selectTopic = useCallback(
    (id: FeedTopic) => {
      const next = toggleTopic(topics, id);
      setTopics(next);
      setMapFilterIds(null);
      setSelectedClusterId(null);
      trackFeedTopicChanged({ topics: next, city, surface: "map" });
      syncUrl(mode, area, sources, date, selection, next);
    },
    [topics, city, syncUrl, mode, area, sources, date, selection],
  );

  const clearTopics = useCallback(() => {
    setTopics([]);
    setMapFilterIds(null);
    setSelectedClusterId(null);
    trackFeedTopicChanged({ topics: [], city, surface: "map" });
    syncUrl(mode, area, sources, date, selection, []);
  }, [city, syncUrl, mode, area, sources, date, selection]);

  const selectToday = useCallback(() => {
    const today = dayKey(new Date(), timeZone);
    setMode("today");
    setDate(today);
    trackFeedModeChanged({ mode: "today", city, area });
    syncUrl("today", area, sources, today, selection);
  }, [timeZone, city, area, sources, selection, syncUrl]);

  const selectWeekend = useCallback(() => {
    setMode("weekend");
    setDate(null);
    trackFeedModeChanged({ mode: "weekend", city, area });
    syncUrl("weekend", area, sources, null, selection);
  }, [city, area, sources, selection, syncUrl]);

  const selectDate = useCallback(
    (nextDate: string) => {
      setMode("date");
      setDate(nextDate);
      trackFeedDateChanged({ date: nextDate, mode: "date", city });
      syncUrl("date", area, sources, nextDate, selection);
    },
    [city, area, sources, selection, syncUrl],
  );

  const clearMapFilter = useCallback(() => {
    setMapFilterIds(null);
    setSelectedClusterId(null);
  }, []);

  const onClusterFilter = useCallback(
    (ids: string[], clusterId: number) => {
      setMapFilterIds(ids);
      setSelectedClusterId(clusterId);
      if (!isDesktop) setSheetOpen(true);
    },
    [isDesktop],
  );

  const onSelectPin = useCallback(
    (id: string) => {
      setSelectedClusterId(null);
      if (!isDesktop) {
        setMapFilterIds([id]);
        setSheetOpen(true);
      }
      const card = cards.find((c) => c.id === id);
      if (card) openDetail(card);
      else {
        trackDetailOpened({ kind: "event", id, surface: "map" });
        syncUrl(mode, area, sources, date, { kind: "event", id });
      }
    },
    [cards, openDetail, syncUrl, mode, area, sources, date, isDesktop],
  );

  const feedHrefStable = useMemo(
    () =>
      feedHomeHrefExplicit({
        mode,
        area,
        sources,
        topics: [],
        date: feedModeAllowsDate(mode) ? date : null,
      }),
    [mode, area, sources, date],
  );
  const [feedHref, setFeedHref] = useState(feedHrefStable);

  useEffect(() => {
    setFeedHref(feedHomeHref(mode, area, sources, date));
  }, [mode, area, sources, date]);

  const cityLabel = FEED_CITY_LABELS[city];
  const isRefreshing = loading && cards.length > 0;
  const showMapLoading = loading && cards.length === 0;

  return (
    <div className="map-layout">
      <header className="map-chrome">
        <div className="map-chrome__left">
          <MapDateControl
            mode={mode}
            date={date}
            timeZone={timeZone}
            daysWithEvents={calendarBounds.daysWithEvents}
            minDate={calendarBounds.minDate}
            maxDate={calendarBounds.maxDate}
            onSelectToday={selectToday}
            onSelectWeekend={selectWeekend}
            onSelectDate={selectDate}
          />
          <Link
            href={feedHref}
            className="map-chrome__city-link"
            title="Back to feed"
          >
            {cityLabel}
          </Link>
        </div>
        <Link href={feedHref} className="map-chrome__brand" title="Back to feed">
          Bored<span>.</span>
        </Link>
      </header>

      <div className="map-body">
        <MapEventSidebar
          cards={visibleCards}
          timeZone={timeZone}
          selection={selection}
          presentTopics={presentTopics}
          selectedTopics={topics}
          onToggleTopic={selectTopic}
          onClearTopics={clearTopics}
          mapFilterActive={Boolean(mapFilterIds)}
          onClearMapFilter={clearMapFilter}
          onSelectCard={openDetail}
          onBackFromDetail={closeDetail}
          onCloseDetail={closeDetail}
          sheetOpen={sheetOpen}
          onCloseSheet={closeSheet}
          loading={loading}
          loadingLabel={gatheringPhraseForArea(area)}
        />
        <div className="map-body__map">
          <div className="map-filters map-filters--mobile">
            <MapTopicCarousel
              topics={presentTopics}
              selected={topics}
              onToggle={selectTopic}
              onClear={clearTopics}
            />
          </div>
          {(showMapLoading || isRefreshing) && (
            <p
              className="feed-refresh-status map-loading-status"
              role="status"
              aria-live="polite"
            >
              <span className="feed-refresh-status__spinner" aria-hidden />
              {mapLoadingPhrase(area, cityLabel)}
            </p>
          )}
          {error && (
            <p className="map-pane map-pane--missing-token muted">
              Can&apos;t reach API ({error}).
            </p>
          )}
          {!error && (
            <div
              className={`map-pane${isRefreshing ? " map-pane--refreshing" : ""}`}
              aria-busy={isRefreshing}
            >
              <MapEventsMap
                city={city}
                cards={mapCards}
                selectedId={selection?.kind === "event" ? selection.id : null}
                selectedClusterId={selectedClusterId}
                onClusterFilter={onClusterFilter}
                onSelectEvent={onSelectPin}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CityMapRoute() {
  return (
    <Suspense
      fallback={
        <div className="map-layout">
          <p className="muted" style={{ padding: 24 }}>
            Loading map…
          </p>
        </div>
      }
    >
      <CityMapInner />
    </Suspense>
  );
}
