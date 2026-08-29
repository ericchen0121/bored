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
  feedFilterSourcesForCity,
  feedModeAllowsDate,
  metroFromArea,
  parseFeedSources,
  parseFeedTopics,
  type FeedCity,
} from "@bored/shared";
import { api } from "@/lib/api";
import {
  trackFeedAreaChanged,
  trackFeedDateChanged,
  trackFeedLoaded,
  trackFeedModeChanged,
  trackFeedTopicChanged,
  trackFeedViewChanged,
  trackDetailOpened,
} from "@/lib/analytics";
import { CityHero } from "@/components/CityHero";
import { FeedCardView } from "@/components/FeedCardView";
import { ByTimeFeed } from "@/components/ByTimeFeed";
import { DayStrip } from "@/components/DayStrip";
import { MoviesSection } from "@/components/MoviesSection";
import { FeedViewToggle } from "@/components/FeedViewToggle";
import { DetailDrawer } from "@/components/detail/DetailDrawer";
import {
  cardMatchesSelection,
  selectionFromCard,
} from "@/components/detail/selection";
import type { DetailSelection } from "@/components/detail/types";
import { parseFeedDate, timeZoneForArea, dayCardLabel, dayKey } from "@/lib/datetime";
import {
  defaultCalendarMaxDate,
  feedCalendarMeta,
  type FeedCalendarMeta,
} from "@/lib/feed-calendar";
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
} from "@/lib/feed-prefs";

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
  const [feedView, setFeedView] = useState<FeedView>("cards");
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [prefsSummary, setPrefsSummary] = useState<{
    interests: string[];
    neighborhoods: string[];
    budgetMax: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [prefsHydrated, setPrefsHydrated] = useState(() =>
    searchParams.has("mode"),
  );

  const cityAreas = areasForCity(city);
  const timeZone = timeZoneForArea(area);

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
        [],
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
      const next = selectionFromCard(card);
      trackDetailOpened({
        kind: next.kind,
        id: next.id,
        surface: "feed",
      });
      syncUrl(mode, area, sources, date, next);
    },
    [syncUrl, mode, area, sources, date],
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

  // Restore mode/sources/topics when landing without ?mode=
  useEffect(() => {
    if (searchParams.has("mode")) {
      setPrefsHydrated(true);
      return;
    }

    const stored = readFeedPrefs();
    if (stored && metroFromArea(stored.area) === city) {
      const nextArea = searchParams.has("area")
        ? areaFromCityPath(city, searchParams.get("area"))
        : stored.area === "sf" || stored.area === "bay"
          ? stored.area
          : areaFromCityPath(city, null);
      setMode(stored.mode);
      setArea(nextArea);
      // Sources stay URL-only for QA — never restore from prefs.
      setTopics(stored.topics);
      setDate(stored.date);
      syncUrl(
        stored.mode,
        nextArea,
        sources,
        stored.date,
        selectionFromParams(searchParams),
        stored.topics,
      );
    } else {
      syncUrl(
        mode,
        area,
        sources,
        date,
        selectionFromParams(searchParams),
        topics,
      );
    }
    setPrefsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, searchParams]);

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
      [],
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
      };
    }>("/v1/me")
      .then((me) => {
        setPrefsSummary({
          interests: me.prefs.interests.map((i) => i.category),
          neighborhoods: me.prefs.neighborhoods,
          budgetMax: me.prefs.budgetMax,
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
    setLoading(true);
    setError(null);
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
    void api<{
      cards: FeedCard[];
      prefsSummary?: {
        interests: string[];
        neighborhoods: string[];
        budgetMax: number | null;
      };
    }>(`/v1/feed?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setCards(data.cards);
        if (overviewFetch) {
          setCalendarMeta(feedCalendarMeta(data.cards, timeZone));
        }
        if (data.prefsSummary) setPrefsSummary(data.prefsSummary);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prefsHydrated, mode, area, sources, topics, date, timeZone, refreshKey]);

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

  const movies = cards.filter((c) => c.kind === "movie_showtime");
  const events = cards.filter((c) => c.kind === "event");

  const allUpcomingLabel =
    area === "chicago"
      ? "All upcoming in Chicago"
      : area === "sf"
        ? "All upcoming in SF"
        : "All upcoming in the Bay";

  const effectiveDate =
    mode === "today" ? (date ?? dayKey(new Date(), timeZone)) : date;

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
    (chronologicalBrowse && feedView !== "poster");

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
    if (mode === "for_you") return "Picked for you";
    if (mode === "today") {
      return selectedDay
        ? `Today · ${selectedDay.dateLine}`
        : "Today";
    }
    if (selectedDay) {
      return selectedDay.isToday
        ? `Today · ${selectedDay.dateLine}`
        : `${selectedDay.weekday} · ${selectedDay.dateLine}`;
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
        <CityHero city={city} area={area}>
          {prefsSummary && prefsSummary.interests.length > 0 && (
            <p className="meta" style={{ marginTop: 12 }}>
              Tastes:{" "}
              {prefsSummary.interests
                .slice(0, 5)
                .map((c) => categoryLabel(c))
                .join(" · ")}
              {prefsSummary.interests.length > 5
                ? ` +${prefsSummary.interests.length - 5}`
                : ""}
            </p>
          )}
        </CityHero>

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
            {movies.length > 0 &&
              (mode === "for_you" || (mode === "weekend" && !date)) && (
              <MoviesSection
                movies={movies}
                selected={selection}
                onSelect={openDetail}
                timeZone={timeZone}
              />
            )}

            <section>
              <div className="section-title-row">
                <h2 className="section-title">{sectionTitle}</h2>
                <div className="section-title-row__actions">
                  <Link
                    href={feedMapHref(mode, area, sources, date, topics)}
                    className="feed-map-link"
                  >
                    Map
                  </Link>
                  <FeedViewToggle value={feedView} onChange={selectFeedView} />
                </div>
              </div>
              {events.length === 0 && movies.length === 0 && (
                <p className="muted">
                  Nothing in this view — try All topics
                  {mode !== "date" ? ", pick Select Date" : ""}
                  {city === "sf" ? ", widen to Bay Area, " : ", "}
                  {topics.includes("movies") && city === "chicago"
                    ? " (movies are SF-only for now), "
                    : ""}
                  or <Link href="/onboarding">update tastes</Link>.
                </p>
              )}
              {useByTimeLayout ? (
                <ByTimeFeed
                  cards={cards}
                  timeZone={timeZone}
                  onSelect={openDetail}
                  isSelected={(card) => cardMatchesSelection(card, selection)}
                  hideDayHeadings={
                    mode === "today" || Boolean(effectiveDate)
                  }
                  collapseEarlier={Boolean(selectedDay?.isToday)}
                  sourceFilter={sources}
                  variant={
                    feedView === "by_time"
                      ? "text"
                      : feedView === "large"
                        ? "large"
                        : "default"
                  }
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
                  {(chronologicalBrowse ? cards : events).map((card, i) => (
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
      </div>

      {selection && (
        <DetailDrawer selection={selection} onClose={closeDetail} />
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
