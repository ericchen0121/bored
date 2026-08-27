"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { FeedCard, FeedFilterSource, FeedMode, FeedTopic } from "@bored/shared";
import {
  EVENT_SOURCE_LABELS,
  FEED_CITY_LABELS,
  FEED_CITIES,
  FEED_TOPIC_LABELS,
  FEED_TOPICS,
  areasForCity,
  categoryLabel,
  defaultAreaForCity,
  feedFilterSourcesForCity,
  metroFromArea,
  parseFeedSources,
  parseFeedTopics,
  type FeedCity,
} from "@bored/shared";
import { api } from "@/lib/api";
import { FeedCardView } from "@/components/FeedCardView";
import { ByTimeFeed, FeedListView } from "@/components/ByTimeFeed";
import { DayStrip } from "@/components/DayStrip";
import { MoviesSection } from "@/components/MoviesSection";
import { FeedViewToggle } from "@/components/FeedViewToggle";
import { DetailDrawer } from "@/components/detail/DetailDrawer";
import type { DetailSelection } from "@/components/detail/types";
import { parseFeedDate, timeZoneForArea, dayCardLabel } from "@/lib/datetime";
import {
  type FeedArea,
  type FeedView,
  feedQueryString,
  parseFeedArea,
  parseFeedMode,
  readFeedPrefs,
  readFeedView,
  rememberFeedPrefs,
  rememberFeedView,
} from "@/lib/feed-prefs";

const MODE_LABELS: Record<FeedMode, string> = {
  tonight: "Tonight",
  weekend: "This weekend",
  for_you: "For you",
  all: "By time",
};

const AREA_LABELS: Partial<Record<FeedArea, string>> = {
  sf: "All SF",
  bay: "All Bay Area",
  chicago: "Chicago",
};

function toggleSource(
  current: FeedFilterSource[],
  id: FeedFilterSource,
): FeedFilterSource[] {
  return current.includes(id)
    ? current.filter((s) => s !== id)
    : [...current, id];
}

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

function cardMatchesSelection(card: FeedCard, sel: DetailSelection | null) {
  if (!sel) return false;
  if (sel.kind === "event") return card.kind === "event" && card.id === sel.id;
  return (
    card.kind === "movie_showtime" &&
    (card.filmId === sel.id || card.id === sel.id)
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialMode = parseFeedMode(searchParams.get("mode"));
  const initialArea = parseFeedArea(searchParams.get("area"));
  const initialCity = metroFromArea(initialArea);
  const initialSources = parseFeedSources(searchParams.get("sources")).filter(
    (s) => feedFilterSourcesForCity(initialCity).includes(s),
  );
  const initialTopics = parseFeedTopics(searchParams.get("topics"));
  const initialDate =
    initialMode === "all" ? parseFeedDate(searchParams.get("date")) : null;

  const [mode, setMode] = useState<FeedMode>(initialMode);
  const [area, setArea] = useState<FeedArea>(initialArea);
  const [sources, setSources] = useState<FeedFilterSource[]>(initialSources);
  const [topics, setTopics] = useState<FeedTopic[]>(initialTopics);
  const [date, setDate] = useState<string | null>(initialDate);
  const [feedView, setFeedView] = useState<FeedView>("cards");
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [prefsSummary, setPrefsSummary] = useState<{
    interests: string[];
    neighborhoods: string[];
    budgetMax: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const city = metroFromArea(area);
  const cityAreas = areasForCity(city);
  const citySources = feedFilterSourcesForCity(city);
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
      const resolvedDate = nextMode === "all" ? nextDate : null;
      rememberFeedPrefs(
        nextMode,
        nextArea,
        nextSources,
        resolvedDate,
        nextTopics,
      );
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
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, selection, date, topics],
  );

  const openDetail = useCallback(
    (card: FeedCard) => {
      const next: DetailSelection =
        card.kind === "movie_showtime" && card.filmId
          ? { kind: "movie", id: card.filmId }
          : { kind: "event", id: card.id };
      syncUrl(mode, area, sources, date, next);
    },
    [syncUrl, mode, area, sources, date],
  );

  const closeDetail = useCallback(() => {
    syncUrl(mode, area, sources, date, null);
  }, [syncUrl, mode, area, sources, date]);

  const switchCity = useCallback(
    (nextCity: FeedCity) => {
      const nextArea = defaultAreaForCity(nextCity);
      const allowed = new Set(feedFilterSourcesForCity(nextCity));
      const nextSources = sources.filter((s) => allowed.has(s));
      setArea(nextArea);
      setSources(nextSources);
      syncUrl(mode, nextArea, nextSources, date);
    },
    [mode, sources, syncUrl, date],
  );

  const selectMode = useCallback(
    (nextMode: FeedMode) => {
      const nextDate = nextMode === "all" ? date : null;
      setMode(nextMode);
      if (nextMode !== "all") setDate(null);
      syncUrl(nextMode, area, sources, nextDate);
    },
    [area, sources, date, syncUrl],
  );

  const selectDay = useCallback(
    (nextDate: string | null) => {
      setDate(nextDate);
      setMode("all");
      syncUrl("all", area, sources, nextDate);
    },
    [area, sources, syncUrl],
  );

  // Bare `/` (no mode) — restore last feed prefs instead of wiping them.
  useEffect(() => {
    if (searchParams.has("mode")) return;
    const stored = readFeedPrefs();
    if (!stored) return;
    setMode(stored.mode);
    setArea(stored.area);
    setSources(stored.sources);
    setTopics(stored.topics);
    setDate(stored.date);
    syncUrl(
      stored.mode,
      stored.area,
      stored.sources,
      stored.date,
      selectionFromParams(searchParams),
      stored.topics,
    );
  }, [searchParams, syncUrl]);

  useEffect(() => {
    setFeedView(readFeedView());
  }, []);

  const selectFeedView = useCallback((next: FeedView) => {
    setFeedView(next);
    rememberFeedView(next);
  }, []);

  useEffect(() => {
    if (!searchParams.has("mode")) return;
    rememberFeedPrefs(
      mode,
      area,
      sources,
      mode === "all" ? date : null,
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
        setOnboardingComplete(me.onboardingComplete);
        setPrefsSummary({
          interests: me.prefs.interests.map((i) => i.category),
          neighborhoods: me.prefs.neighborhoods,
          budgetMax: me.prefs.budgetMax,
        });
      })
      .catch(() => setOnboardingComplete(false));
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const limit = mode === "all" || date ? 200 : 40;
    const params = new URLSearchParams({
      mode,
      area,
      limit: String(limit),
    });
    if (sources.length) params.set("sources", sources.join(","));
    if (topics.length) params.set("topics", topics.join(","));
    if (mode === "all" && date) params.set("date", date);
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
  }, [mode, area, sources, topics, date, refreshKey]);

  const movies = cards.filter((c) => c.kind === "movie_showtime");
  const events = cards.filter((c) => c.kind === "event");

  const eyebrow =
    area === "chicago"
      ? "Chicago"
      : area === "sf"
        ? "San Francisco"
        : "SF Bay Area";

  const allUpcomingLabel =
    area === "chicago"
      ? "All upcoming in Chicago"
      : area === "sf"
        ? "All upcoming in SF"
        : "All upcoming in the Bay";

  const selectedDay = useMemo(
    () => (date ? dayCardLabel(date, timeZone) : null),
    [date, timeZone],
  );

  return (
    <div className={`feed-layout ${selection ? "has-detail" : ""}`}>
      <div className="feed-main">
        <div className="topbar">
          <p className="eyebrow">{eyebrow}</p>
          <Link href="/onboarding">
            {onboardingComplete ? "Edit tastes" : "Set tastes"}
          </Link>
        </div>

        <header className="hero">
          <h1 className="brand">
            Bored<span>.</span>
          </h1>
          <p className="lede">
            What&apos;s on — music, comedy, movies, and the odd gem outside your
            usual.
          </p>
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
        </header>

        <div className="feed-filters">
          <div className="city-select">
            <label htmlFor="feed-city">City</label>
            <select
              id="feed-city"
              value={city}
              onChange={(e) => switchCity(e.target.value as FeedCity)}
            >
              {FEED_CITIES.map((id) => (
                <option key={id} value={id}>
                  {FEED_CITY_LABELS[id]}
                </option>
              ))}
            </select>
          </div>

          {cityAreas.length > 1 && (
            <nav className="nav" aria-label="Area">
              {cityAreas.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`chip ${area === id ? "active" : ""}`}
                  onClick={() => {
                    setArea(id);
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

          {mode === "all" && (
            <DayStrip
              timeZone={timeZone}
              selectedDate={date}
              onSelect={selectDay}
            />
          )}

          <nav className="nav" aria-label="Topics">
            <button
              type="button"
              className={`chip ${topics.length === 0 ? "active" : ""}`}
              onClick={() => {
                setTopics([]);
                syncUrl(mode, area, sources, date, selection, []);
              }}
            >
              All topics
            </button>
            {FEED_TOPICS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${topics.includes(id) ? "active" : ""}`}
                onClick={() => {
                  const next = toggleTopic(topics, id);
                  setTopics(next);
                  // Topics replace source browsing — avoid empty AND intersection
                  setSources([]);
                  syncUrl(mode, area, [], date, selection, next);
                }}
              >
                {FEED_TOPIC_LABELS[id]}
              </button>
            ))}
          </nav>

          <nav className="nav nav--sources" aria-label="Source">
            <button
              type="button"
              className={`chip ${sources.length === 0 ? "active" : ""}`}
              onClick={() => {
                setSources([]);
                syncUrl(mode, area, [], date);
              }}
            >
              All sources
            </button>
            {citySources.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${sources.includes(id) ? "active" : ""}`}
                onClick={() => {
                  const next = toggleSource(sources, id);
                  setSources(next);
                  syncUrl(mode, area, next, date);
                }}
              >
                {EVENT_SOURCE_LABELS[id]}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <p className="muted" style={{ marginTop: 16 }}>
            Can&apos;t reach API ({error}). Is `pnpm dev:api` running on :4000?
          </p>
        )}

        {loading && <p className="muted">Gathering the fog…</p>}

        {!loading && !error && (
          <>
            {movies.length > 0 && mode !== "all" && (
              <MoviesSection
                movies={movies}
                selected={selection}
                onSelect={openDetail}
                timeZone={timeZone}
              />
            )}

            <section>
              <div className="section-title-row">
                <h2 className="section-title">
                  {mode === "tonight"
                    ? "Happening tonight"
                    : mode === "weekend"
                      ? "This weekend"
                      : mode === "all"
                        ? selectedDay
                          ? selectedDay.isToday
                            ? `Today · ${selectedDay.dateLine}`
                            : `${selectedDay.weekday} · ${selectedDay.dateLine}`
                          : allUpcomingLabel
                        : "Picked for you"}
                </h2>
                <FeedViewToggle value={feedView} onChange={selectFeedView} />
              </div>
              {events.length === 0 && movies.length === 0 && (
                <p className="muted">
                  Nothing in this view — try All topics and All sources, switch to
                  By time
                  {city === "sf" ? ", widen to Bay Area, " : ", "}
                  {topics.includes("movies") && city === "chicago"
                    ? " (movies are SF-only for now), "
                    : ""}
                  or <Link href="/onboarding">update tastes</Link>.
                </p>
              )}
              {mode === "all" ? (
                <ByTimeFeed
                  cards={cards}
                  timeZone={timeZone}
                  onSelect={openDetail}
                  isSelected={(card) => cardMatchesSelection(card, selection)}
                  hideDayHeadings={Boolean(date)}
                  collapseEarlier={Boolean(selectedDay?.isToday)}
                  sourceFilter={sources}
                  variant={
                    feedView === "list"
                      ? "text"
                      : feedView === "large"
                        ? "large"
                        : "default"
                  }
                />
              ) : feedView === "list" ? (
                <FeedListView
                  cards={events}
                  timeZone={timeZone}
                  onSelect={openDetail}
                  isSelected={(card) => cardMatchesSelection(card, selection)}
                />
              ) : (
                <div
                  className={`feed-grid${feedView === "large" ? " feed-grid--large" : ""}`}
                >
                  {events.map((card, i) => (
                    <FeedCardView
                      key={`${card.id}:${card.startsAt}`}
                      card={card}
                      selected={cardMatchesSelection(card, selection)}
                      onSelect={openDetail}
                      timeZone={timeZone}
                      size={feedView === "large" ? "large" : "default"}
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
          </>
        )}
      </div>

      {selection && (
        <DetailDrawer selection={selection} onClose={closeDetail} />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <HomeInner />
    </Suspense>
  );
}
