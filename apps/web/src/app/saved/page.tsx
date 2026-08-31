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
import { SignInPrompt } from "@/components/SignInPrompt";
import { useUser } from "@/components/UserProvider";
import { trackDetailOpened } from "@/lib/analytics";
import { api } from "@/lib/api";
import { timeZoneForArea } from "@/lib/datetime";
import {
  defaultCalendarMaxDate,
  feedCalendarMeta,
} from "@/lib/feed-calendar";
import { feedHomeHref, readFeedPrefs } from "@/lib/feed-prefs";

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

function toggleTopic(current: FeedTopic[], id: FeedTopic): FeedTopic[] {
  return current.length === 1 && current[0] === id ? [] : [id];
}

function venueKey(card: FeedCard): string | null {
  const name = card.venueName?.trim();
  return name || null;
}

/** Stable SSR/client first paint — session prefs hydrate after mount. */
const DEFAULT_AREA: FeedArea = "bay";
const DEFAULT_HOME_HREF = "/sf?mode=today";

export default function SavedPage() {
  const router = useRouter();
  const { ready, authenticated, toggleSaved, refresh } = useUser();
  const [data, setData] = useState<SavedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [topics, setTopics] = useState<FeedTopic[]>([]);
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [area, setArea] = useState<FeedArea>(DEFAULT_AREA);
  const [homeHref, setHomeHref] = useState(DEFAULT_HOME_HREF);

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

  const availableTopics = useMemo(
    () => topicsPresentInCards(baseCards),
    [baseCards],
  );

  const filtered = useMemo(() => {
    let cards = baseCards;
    if (topics.length) {
      cards = cards.filter((c) => matchesAnyFeedTopic(topics, c));
    }
    if (selectedDate) {
      cards = cards.filter(
        (c) => c.startsAt && dayKey(c.startsAt, timeZone) === selectedDate,
      );
    }
    return cards;
  }, [baseCards, topics, selectedDate, timeZone]);

  const calendarMeta = useMemo(() => {
    const timed = baseCards.filter((c) => Boolean(c.startsAt));
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
  }, [baseCards, timeZone]);

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

  async function unsaveCard(card: FeedCard) {
    const targetKind = card.kind === "movie_showtime" ? "film" : "event";
    const targetId =
      card.kind === "movie_showtime" && card.filmId ? card.filmId : card.id;
    try {
      await toggleSaved(targetKind, targetId);
      if (selection && cardMatchesSelection(card, selection)) {
        setSelection(null);
      }
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unsave");
    }
  }

  function openDetail(card: FeedCard) {
    const next = selectionFromCard(card);
    trackDetailOpened({
      kind: next.kind,
      id: next.id,
      surface: "feed",
    });
    setSelection(next);
  }

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

            {baseCards.length > 0 ? (
              <>
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

                {availableTopics.length > 0 ? (
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
              </>
            ) : null}

            <section className="saved-section">
              <div className="section-title-row">
                <h2 className="section-title">
                  {selectedDate
                    ? "That day"
                    : showPast
                      ? "All saved"
                      : "Upcoming"}
                  {filtered.length !== baseCards.length
                    ? ` · ${filtered.length}`
                    : ""}
                </h2>
              </div>

              {baseCards.length === 0 ? (
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
              ) : filtered.length === 0 ? (
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
              ) : (
                <div className="feed-grid">
                  {filtered.map((card) => (
                    <div key={card.signalId} className="saved-card-wrap">
                      <FeedCardView
                        card={card}
                        selected={cardMatchesSelection(card, selection)}
                        onSelect={openDetail}
                        timeZone={timeZone}
                      />
                      <button
                        type="button"
                        className="btn saved-card-unsave"
                        onClick={() => void unsaveCard(card)}
                      >
                        Unsave
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>

      {selection ? (
        <DetailDrawer
          selection={selection}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </main>
  );
}
