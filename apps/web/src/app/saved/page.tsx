"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeedCard, FeedArea, FeedTopic } from "@bored/shared";
import {
  FEED_TOPIC_EMOJI,
  FEED_TOPIC_LABELS,
  dayKey,
  eventScanTagsForDisplay,
  isFeedVideoCard,
  matchesAnyFeedTopic,
  metroFromArea,
  topicsPresentInCards,
} from "@bored/shared";
import { DayStrip } from "@/components/DayStrip";
import { DetailDrawer } from "@/components/detail/DetailDrawer";
import {
  cardMatchesSelection,
  selectionFromCard,
} from "@/components/detail/selection";
import type { DetailSelection } from "@/components/detail/types";
import { FeedCardView } from "@/components/FeedCardView";
import { FeedViewToggle } from "@/components/FeedViewToggle";
import { SaveButton } from "@/components/SaveButton";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useUser } from "@/components/UserProvider";
import { VideoReelsCarousel } from "@/components/VideoReelsCarousel";
import { trackDetailOpened } from "@/lib/analytics";
import { api, recordFeedSignal } from "@/lib/api";
import { dayCardLabel, timeZoneForArea } from "@/lib/datetime";
import {
  defaultCalendarMaxDate,
  feedCalendarMeta,
} from "@/lib/feed-calendar";
import {
  feedHomeHref,
  readFeedPrefs,
  type FeedView,
} from "@/lib/feed-prefs";

type SavedCard = FeedCard & {
  signalId: string;
  signalType: string;
  savedAt: string;
  past: boolean;
};

type SavedPayload = {
  upcoming: SavedCard[];
  past: SavedCard[];
};

const SAVED_REELS_VIEWS = ["reels", "large"] as const satisfies readonly FeedView[];

function saveTarget(card: FeedCard): {
  targetKind: "event" | "film";
  targetId: string;
} {
  if (card.kind === "movie_showtime" && card.filmId) {
    return { targetKind: "film", targetId: card.filmId };
  }
  return { targetKind: "event", targetId: card.id };
}

function toggleTopic(current: FeedTopic[], id: FeedTopic): FeedTopic[] {
  return current.length === 1 && current[0] === id ? [] : [id];
}

function venueKey(card: FeedCard): string | null {
  const name = card.venueName?.trim();
  return name || null;
}

function applyTopicFilter(cards: SavedCard[], topics: FeedTopic[]): SavedCard[] {
  if (!topics.length) return cards;
  return cards.filter((c) => matchesAnyFeedTopic(topics, c));
}

/** Stable SSR/client first paint — session prefs hydrate after mount. */
const DEFAULT_AREA: FeedArea = "bay";
const DEFAULT_HOME_HREF = "/sf?mode=today";

export default function SavedPage() {
  const router = useRouter();
  const { ready, authenticated, refresh } = useUser();
  const [data, setData] = useState<SavedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [topics, setTopics] = useState<FeedTopic[]>([]);
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [area, setArea] = useState<FeedArea>(DEFAULT_AREA);
  const [homeHref, setHomeHref] = useState(DEFAULT_HOME_HREF);
  const [reelsView, setReelsView] = useState<FeedView>("reels");
  const [reelsShowAll, setReelsShowAll] = useState(false);

  const city = metroFromArea(area);
  const timeZone = timeZoneForArea(area);

  useEffect(() => {
    const stored = readFeedPrefs();
    if (!stored) {
      setHomeHref(feedHomeHref("today", DEFAULT_AREA, [], null, []));
      return;
    }
    setArea(stored.area);
    setHomeHref(
      feedHomeHref(
        stored.mode,
        stored.area,
        stored.sources,
        stored.date,
        stored.topics,
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<SavedPayload>("/v1/me/saved");
      setData({
        upcoming: res.upcoming ?? [],
        past: res.past ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saves");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, authenticated, load]);

  const baseCards = useMemo(() => {
    if (!data) return [] as SavedCard[];
    return showPast ? [...data.upcoming, ...data.past] : data.upcoming;
  }, [data, showPast]);

  const { reelCards, eventCards } = useMemo(() => {
    const reels: SavedCard[] = [];
    const events: SavedCard[] = [];
    for (const card of baseCards) {
      if (isFeedVideoCard(card)) reels.push(card);
      else events.push(card);
    }
    return { reelCards: reels, eventCards: events };
  }, [baseCards]);

  const availableTopics = useMemo(
    () => topicsPresentInCards(baseCards),
    [baseCards],
  );

  const filteredReels = useMemo(
    () => applyTopicFilter(reelCards, topics),
    [reelCards, topics],
  );

  const filteredEvents = useMemo(() => {
    let cards = applyTopicFilter(eventCards, topics);
    if (selectedDate) {
      cards = cards.filter(
        (c) => c.startsAt && dayKey(c.startsAt, timeZone) === selectedDate,
      );
    }
    return cards;
  }, [eventCards, topics, selectedDate, timeZone]);

  const calendarMeta = useMemo(() => {
    const timed = eventCards.filter((c) => Boolean(c.startsAt));
    const meta = feedCalendarMeta(timed, timeZone);
    const dayCounts = new Map<string, number>();
    for (const card of timed) {
      const key = dayKey(card.startsAt, timeZone);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
    const maxFromCounts = [...dayCounts.keys()].sort().at(-1);
    return {
      ...meta,
      dayCounts,
      maxDate: maxFromCounts
        ? maxFromCounts > meta.maxDate
          ? maxFromCounts
          : meta.maxDate
        : defaultCalendarMaxDate(meta.minDate),
    };
  }, [eventCards, timeZone]);

  const stats = useMemo(() => {
    const venues = new Set<string>();
    const tagLabels = new Map<string, number>();
    for (const card of baseCards) {
      const v = venueKey(card);
      if (v) venues.add(v);
      for (const t of eventScanTagsForDisplay(
        card.categories,
        card.tags,
        8,
      )) {
        tagLabels.set(t.label, (tagLabels.get(t.label) ?? 0) + 1);
      }
    }
    const topTags = [...tagLabels.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
    return {
      count: baseCards.length,
      venueCount: venues.size,
      topVenues: [...venues].slice(0, 5),
      topTags,
    };
  }, [baseCards]);

  async function afterUnsave(card: FeedCard) {
    if (selection && cardMatchesSelection(card, selection)) {
      setSelection(null);
    }
    await load();
    await refresh();
  }

  function openDetail(card: FeedCard) {
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
    setSelection(next);
  }

  function selectReelsView(view: FeedView) {
    setReelsView(view);
    if (view === "large") setReelsShowAll(false);
  }

  const eventsEmpty = eventCards.length === 0;
  const eventsFilteredEmpty = filteredEvents.length === 0;
  const showReelsSection = filteredReels.length > 0;
  const showEventsFilters = eventCards.length > 0;

  return (
    <main className={`saved-page${selection ? " has-detail" : ""}`}>
      <div className="saved-page__main">
        <header className="saved-page__header">
          <h1 className="saved-page__title">Saved</h1>
          <Link href={homeHref} className="saved-page__back">
            ← Back to feed
          </Link>
        </header>

        {!ready || loading ? (
          <p className="muted">Loading your saves…</p>
        ) : null}

        {ready && !loading && !authenticated ? (
          <div className="saved-page__guest">
            <p className="lede">
              Saves on this device stay here. Sign in to keep them across
              phones.
            </p>
            <SignInPrompt variant="card" returnTo="/saved" />
          </div>
        ) : null}

        {error ? <p className="muted">{error}</p> : null}

        {ready && !loading && data ? (
          <>
            {baseCards.length > 0 || data.past.length > 0 ? (
              <div className="saved-stats" aria-label="Saved stats">
                <div className="saved-stats__pill">
                  <span className="saved-stats__num">{stats.count}</span>
                  <span className="saved-stats__label">
                    {showPast ? "saved" : "upcoming"}
                  </span>
                </div>
                <div className="saved-stats__pill">
                  <span className="saved-stats__num">{stats.venueCount}</span>
                  <span className="saved-stats__label">venues</span>
                </div>
                <div className="saved-stats__pill">
                  <span className="saved-stats__num">{stats.topTags.length}</span>
                  <span className="saved-stats__label">top tags</span>
                </div>
                {data.past.length > 0 ? (
                  <button
                    type="button"
                    className={`chip saved-stats__toggle${showPast ? " active" : ""}`}
                    onClick={() => setShowPast((v) => !v)}
                  >
                    {showPast ? "Hide past" : `Include past (${data.past.length})`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {stats.topTags.length > 0 ? (
              <p className="saved-tag-summary">
                {stats.topTags.map(([label, n]) => (
                  <span key={label} className="badge genre">
                    {label}
                    {n > 1 ? ` · ${n}` : ""}
                  </span>
                ))}
              </p>
            ) : null}

            {stats.topVenues.length > 0 ? (
              <p className="saved-venue-summary meta">
                Venues: {stats.topVenues.join(" · ")}
                {stats.venueCount > stats.topVenues.length
                  ? ` +${stats.venueCount - stats.topVenues.length}`
                  : ""}
              </p>
            ) : null}

            {showEventsFilters ? (
              <DayStrip
                timeZone={timeZone}
                selectedDate={selectedDate}
                daysWithEvents={calendarMeta.daysWithEvents}
                dayCounts={calendarMeta.dayCounts}
                minDate={calendarMeta.minDate}
                maxDate={calendarMeta.maxDate}
                onSelect={setSelectedDate}
                showAllDays
                showCalendar
              />
            ) : null}

            {availableTopics.length > 0 && baseCards.length > 0 ? (
              <nav
                className="nav nav--topics"
                aria-label="Saved topics"
                style={{ marginTop: 8 }}
              >
                <button
                  type="button"
                  className={`chip ${topics.length === 0 ? "active" : ""}`}
                  onClick={() => setTopics([])}
                >
                  All
                </button>
                {availableTopics.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${topics.includes(id) ? "active" : ""}`}
                    onClick={() => setTopics(toggleTopic(topics, id))}
                  >
                    <span aria-hidden>{FEED_TOPIC_EMOJI[id]}</span>{" "}
                    {FEED_TOPIC_LABELS[id]}
                  </button>
                ))}
              </nav>
            ) : null}

            {showReelsSection ? (
              <section className="saved-reels">
                <div className="section-title-row">
                  <h2 className="section-title">
                    Reels &amp; shorts
                    {filteredReels.length > 0
                      ? ` · ${filteredReels.length}`
                      : ""}
                  </h2>
                  <div className="section-title-row__actions">
                    {reelsView === "reels" && filteredReels.length > 3 ? (
                      <button
                        type="button"
                        className="feed-map-link"
                        onClick={() => setReelsShowAll((v) => !v)}
                      >
                        {reelsShowAll ? "Show less" : "Show all"}
                      </button>
                    ) : null}
                    <FeedViewToggle
                      value={reelsView}
                      onChange={selectReelsView}
                      views={SAVED_REELS_VIEWS}
                      ariaLabel="Saved reels layout"
                    />
                  </div>
                </div>

                {reelsView === "large" ? (
                  <div className="feed-grid feed-grid--large">
                    {filteredReels.map((card) => {
                      const target = saveTarget(card);
                      return (
                        <div key={card.signalId} className="saved-card-wrap">
                          <FeedCardView
                            card={card}
                            selected={cardMatchesSelection(card, selection)}
                            onSelect={openDetail}
                            timeZone={timeZone}
                            size="large"
                          />
                          <SaveButton
                            className="saved-card-wrap__save"
                            targetKind={target.targetKind}
                            targetId={target.targetId}
                            returnTo="/saved"
                            tooltip
                            onToggled={(saved) => {
                              if (!saved) void afterUnsave(card);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <VideoReelsCarousel
                    cards={filteredReels}
                    layout={reelsShowAll ? "grid" : "carousel"}
                    hideHeader
                    onSelect={openDetail}
                    isSelected={(card) =>
                      cardMatchesSelection(card, selection)
                    }
                  />
                )}
              </section>
            ) : null}

            {baseCards.length === 0 ? (
              <section className="saved-section">
                <p className="muted">
                  Nothing saved yet.{" "}
                  <button
                    type="button"
                    className="saved-page__linkish"
                    onClick={() => router.push(`/${city}?mode=today`)}
                  >
                    Browse today
                  </button>
                  .
                </p>
              </section>
            ) : !showReelsSection && eventsFilteredEmpty ? (
              <section className="saved-section">
                <p className="muted">
                  No saves match this filter.{" "}
                  <button
                    type="button"
                    className="saved-page__linkish"
                    onClick={() => {
                      setTopics([]);
                      setSelectedDate(null);
                    }}
                  >
                    Clear filters
                  </button>
                  .
                </p>
              </section>
            ) : !eventsEmpty ? (
              <section className="saved-section">
                <div className="section-title-row">
                  <h2 className="section-title">
                    {selectedDate
                      ? (() => {
                          const day = dayCardLabel(selectedDate, timeZone);
                          return day.isToday ? (
                            <>
                              Today{" "}
                              <span className="section-title__day">
                                {day.weekdayLong}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="section-title__day">
                                {day.weekdayLong}
                              </span>
                              {" · "}
                              {day.dateLine}
                            </>
                          );
                        })()
                      : showPast
                        ? "Events"
                        : "Upcoming"}
                    {` · ${filteredEvents.length}`}
                  </h2>
                </div>

                {eventsFilteredEmpty ? (
                  <p className="muted">
                    No events match this filter.{" "}
                    <button
                      type="button"
                      className="saved-page__linkish"
                      onClick={() => {
                        setTopics([]);
                        setSelectedDate(null);
                      }}
                    >
                      Clear filters
                    </button>
                    .
                  </p>
                ) : (
                  <div className="feed-grid">
                    {filteredEvents.map((card) => {
                      const target = saveTarget(card);
                      return (
                        <div key={card.signalId} className="saved-card-wrap">
                          <FeedCardView
                            card={card}
                            selected={cardMatchesSelection(card, selection)}
                            onSelect={openDetail}
                            timeZone={timeZone}
                          />
                          <SaveButton
                            className="saved-card-wrap__save"
                            targetKind={target.targetKind}
                            targetId={target.targetId}
                            returnTo="/saved"
                            tooltip
                            onToggled={(saved) => {
                              if (!saved) void afterUnsave(card);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {selection ? (
        <DetailDrawer
          selection={selection}
          onClose={() => setSelection(null)}
          reelPlaylist={filteredReels}
        />
      ) : null}
    </main>
  );
}
