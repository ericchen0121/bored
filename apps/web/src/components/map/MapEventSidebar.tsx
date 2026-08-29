"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { FeedCard, FeedTopic } from "@bored/shared";
import {
  eventScanTagsForDisplay,
  isHappeningNow,
  primaryEventType,
  registrationStatusLabel,
  sourceLabel,
} from "@bored/shared";
import { api } from "@/lib/api";
import { formatDayHeading, formatTime, groupCardsByDay } from "@/lib/datetime";
import { cardEventType } from "@/lib/evergreen-poster";
import { EventDetailContent } from "@/components/detail/EventDetailContent";
import { MovieDetailContent } from "@/components/detail/MovieDetailContent";
import {
  LumaMeshBackground,
  MESH_PALETTES,
  type MeshPalette,
} from "@/components/detail/LumaMeshBackground";
import {
  cardMatchesSelection,
  indexOfSelection,
} from "@/components/detail/selection";
import type {
  DetailSelection,
  EventDetail,
  FilmDetail,
} from "@/components/detail/types";
import { TimelineThumbMedia } from "@/components/EventPosterMedia";
import { LiveNowBadge } from "@/components/LiveNowBadge";
import { useNow } from "@/hooks/useNow";
import { MapTopicCarousel } from "./MapTopicCarousel";

const SHEET_MID = 0.5;
const SHEET_MAX = 0.92;
const SHEET_DISMISS = 0.28;
const SHEET_SNAP_UP = 0.72;
/** px/ms — fling thresholds for snap decisions */
const SHEET_FLING = 0.55;

function sheetTranslateY(visibleFrac: number): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, (SHEET_MAX - visibleFrac) * window.innerHeight);
}

function sheetVisibleFrac(translateY: number): number {
  if (typeof window === "undefined") return SHEET_MID;
  return SHEET_MAX - translateY / window.innerHeight;
}

/** Ignore swipes that begin near the screen edge (browser back/forward). */
const SWIPE_EDGE_GUARD_PX = 32;
const SWIPE_THRESHOLD_PX = 56;
const SWIPE_HORIZONTAL_RATIO = 1.35;

type SwipeNavHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
};

function useDetailSwipeNav({
  enabled,
  onPrev,
  onNext,
}: {
  enabled: boolean;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}): SwipeNavHandlers {
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    axis: "undecided" | "horizontal" | "vertical";
  } | null>(null);

  const clear = useCallback((el: HTMLElement, pointerId: number) => {
    const g = gesture.current;
    if (!g || g.pointerId !== pointerId) return;
    gesture.current = null;
    try {
      el.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0) return;
      // Don't steal clicks from buttons/links inside the detail body.
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, select, label")) return;

      const x = e.clientX;
      if (x < SWIPE_EDGE_GUARD_PX || x > window.innerWidth - SWIPE_EDGE_GUARD_PX) {
        return;
      }

      gesture.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        axis: "undecided",
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || g.axis === "vertical") return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.axis === "undecided") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) * SWIPE_HORIZONTAL_RATIO >= Math.abs(dx)) {
        g.axis = "vertical";
        clear(e.currentTarget, e.pointerId);
        return;
      }
      g.axis = "horizontal";
    }
  }, [clear]);

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.startX;
      const axis = g.axis;
      clear(e.currentTarget, e.pointerId);

      if (axis !== "horizontal") return;
      if (dx >= SWIPE_THRESHOLD_PX) onPrev?.();
      else if (dx <= -SWIPE_THRESHOLD_PX) onNext?.();
    },
    [clear, onPrev, onNext],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? (
        <path d="M15 6l-6 6 6 6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}

function MapSidebarList({
  cards,
  timeZone,
  selectedId,
  onSelect,
  animateKey,
  loading = false,
  loadingLabel = "Loading…",
}: {
  cards: FeedCard[];
  timeZone: string;
  selectedId: string | null;
  onSelect: (card: FeedCard) => void;
  /** Remount key so filter changes re-run stagger. */
  animateKey: string;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const now = useNow();
  const groups = groupCardsByDay(cards, timeZone, now);

  if (loading && cards.length === 0) {
    return (
      <p className="map-sidebar__empty muted map-sidebar__empty--in">
        {loadingLabel}
      </p>
    );
  }

  if (cards.length === 0) {
    return (
      <p key={animateKey} className="map-sidebar__empty muted map-sidebar__empty--in">
        No events in this view.
      </p>
    );
  }

  let stagger = 0;

  return (
    <div key={animateKey} className="map-sidebar__list map-sidebar__list--in">
      {groups.map((group) => (
        <section key={group.key} className="map-sidebar__day">
          <h2
            className="map-sidebar__day-heading"
            style={{ ["--stagger" as string]: Math.min(stagger++, 12) }}
          >
            {formatDayHeading(group.cards[0]!.startsAt, timeZone, now)}
          </h2>
          <ul className="map-sidebar__events">
            {group.cards.map((card) => {
              const live = isHappeningNow(card.startsAt, card.endsAt, now);
              const place = [card.venueName, card.neighborhood]
                .filter(Boolean)
                .join(" · ");
              const tags =
                card.kind === "event"
                  ? eventScanTagsForDisplay(card.categories, card.tags, 2)
                  : [];
              const provenance =
                card.source &&
                (card.kind === "event" || card.source === "indie_theater")
                  ? sourceLabel(card.source)
                  : null;
              const regLabel =
                card.kind === "event"
                  ? registrationStatusLabel(card.registrationStatus)
                  : null;
              const showReg =
                regLabel &&
                card.registrationStatus &&
                card.registrationStatus !== "open";
              const eventType = cardEventType(card);
              const itemStagger = Math.min(stagger++, 12);

              return (
                <li
                  key={`${card.id}:${card.startsAt}`}
                  className="map-sidebar__event-wrap"
                  style={{ ["--stagger" as string]: itemStagger }}
                >
                  <button
                    type="button"
                    className={`map-sidebar__event ${
                      selectedId === card.id ? "is-selected" : ""
                    }`}
                    onClick={() => onSelect(card)}
                  >
                    <TimelineThumbMedia
                      imageUrl={card.imageUrl}
                      eventType={eventType}
                    />
                    <div className="map-sidebar__event-body">
                      <div className="map-sidebar__event-meta">
                        {live ? (
                          <LiveNowBadge />
                        ) : (
                          <time dateTime={card.startsAt}>
                            {formatTime(card.startsAt, timeZone)}
                          </time>
                        )}
                      </div>
                      <span className="map-sidebar__event-title">
                        {card.title}
                      </span>
                      {(place || card.isFree) && (
                        <span className="map-sidebar__event-place">
                          {place}
                          {place && card.isFree ? " · " : ""}
                          {card.isFree ? "Free" : ""}
                        </span>
                      )}
                      {(tags.length > 0 || provenance || showReg) && (
                        <div className="tags">
                          {showReg && (
                            <span
                              className={`badge registration status-${card.registrationStatus}`}
                            >
                              {regLabel}
                            </span>
                          )}
                          {tags.map((t) => (
                            <span key={t.id} className="badge">
                              {t.label}
                            </span>
                          ))}
                          {provenance && (
                            <span className="badge source" title="Listing source">
                              {provenance}
                            </span>
                          )}
                        </div>
                      )}
                      {card.ratings?.infatuation != null && (
                        <div className="ratings">
                          <span className="badge rating-infatuation">
                            Infatuation{" "}
                            {Number(card.ratings.infatuation).toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MapSidebarDetail({
  selection,
  cards,
  onBack,
  onClose,
  onNavigate,
}: {
  selection: DetailSelection;
  cards: FeedCard[];
  onBack: () => void;
  onClose: () => void;
  onNavigate: (card: FeedCard) => void;
}) {
  const titleId = useId();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [film, setFilm] = useState<FilmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const index = indexOfSelection(cards, selection);
  const prevCard = index > 0 ? cards[index - 1]! : null;
  const nextCard =
    index >= 0 && index < cards.length - 1 ? cards[index + 1]! : null;
  const canNav = cards.length > 1 && index >= 0;

  const goPrev = useCallback(() => {
    if (prevCard) onNavigate(prevCard);
  }, [prevCard, onNavigate]);

  const goNext = useCallback(() => {
    if (nextCard) onNavigate(nextCard);
  }, [nextCard, onNavigate]);

  const swipe = useDetailSwipeNav({
    enabled: canNav,
    onPrev: prevCard ? goPrev : null,
    onNext: nextCard ? goNext : null,
  });

  const [swapDir, setSwapDir] = useState<"forward" | "back">("forward");
  const prevIndexRef = useRef(index);

  useEffect(() => {
    if (prevIndexRef.current >= 0 && index >= 0) {
      setSwapDir(index >= prevIndexRef.current ? "forward" : "back");
    }
    prevIndexRef.current = index;
  }, [selection.id, index]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvent(null);
    setFilm(null);

    const path =
      selection.kind === "event"
        ? `/v1/events/${selection.id}`
        : `/v1/movies/${selection.id}`;

    void api<EventDetail | FilmDetail>(path)
      .then((data) => {
        if (cancelled) return;
        if (selection.kind === "event") setEvent(data as EventDetail);
        else setFilm(data as FilmDetail);
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
  }, [selection.kind, selection.id]);

  useEffect(() => {
    if (!canNav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prevCard) {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" && nextCard) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNav, prevCard, nextCard, goPrev, goNext]);

  const meshColors = useMemo((): MeshPalette => {
    if (film) return MESH_PALETTES.movies;
    if (!event) return MESH_PALETTES.event;
    const type = primaryEventType({
      categories: event.categories,
      tags: event.tags,
      venueName: event.venueName,
      source: event.source,
      kind: "event",
    });
    return MESH_PALETTES[type.kind] ?? MESH_PALETTES.event;
  }, [event, film]);

  const renderPager = (className: string) =>
    canNav ? (
      <div className={className} aria-label="Event navigation">
        <button
          type="button"
          className="map-sidebar__nav-btn"
          onClick={goPrev}
          disabled={!prevCard}
          aria-label="Previous event"
        >
          <ChevronIcon dir="left" />
        </button>
        <span className="map-sidebar__nav-count" aria-live="polite">
          {index + 1} / {cards.length}
        </span>
        <button
          type="button"
          className="map-sidebar__nav-btn"
          onClick={goNext}
          disabled={!nextCard}
          aria-label="Next event"
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
    ) : null;

  return (
    <div className="map-sidebar__detail" role="dialog" aria-labelledby={titleId}>
      <LumaMeshBackground colors={meshColors} />
      <div className="map-sidebar__detail-chrome">
        <button
          type="button"
          className="map-sidebar__back"
          onClick={onBack}
        >
          ← Back
        </button>
        <p id={titleId} className="visually-hidden">
          Event details
        </p>
        {renderPager("map-sidebar__nav map-sidebar__nav--chrome")}
        <button
          type="button"
          className="map-sidebar__chrome-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
      <div
        key={selection.id}
        className={`map-sidebar__detail-scroll map-sidebar__detail-scroll--swap-${swapDir}`}
        {...swipe}
      >
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="muted">{error}</p>}
        {!loading && !error && event && (
          <EventDetailContent event={event} compact />
        )}
        {!loading && !error && film && (
          <MovieDetailContent data={film} compact />
        )}
      </div>
      {renderPager("map-sidebar__pager")}
    </div>
  );
}

function EventCountLabel({
  count,
  loading = false,
  loadingLabel = "Loading…",
}: {
  count: number;
  loading?: boolean;
  loadingLabel?: string;
}) {
  if (loading) return <>{loadingLabel}</>;
  return (
    <>
      {count} event{count === 1 ? "" : "s"}
    </>
  );
}

type MapEventPanelProps = {
  cards: FeedCard[];
  timeZone: string;
  selection: DetailSelection | null;
  presentTopics: FeedTopic[];
  selectedTopics: FeedTopic[];
  onToggleTopic: (topic: FeedTopic) => void;
  onClearTopics: () => void;
  mapFilterActive: boolean;
  onClearMapFilter: () => void;
  onSelectCard: (card: FeedCard) => void;
  onBackFromDetail: () => void;
  onCloseDetail: () => void;
  loading?: boolean;
  loadingLabel?: string;
  /** Mobile sheet: close entire sheet (list + detail). */
  onCloseSheet?: () => void;
  showTopics?: boolean;
  variant: "sidebar" | "sheet";
  sheetFraction?: number;
  onSheetFractionChange?: (next: number) => void;
  onSheetDismiss?: () => void;
};

const STAGE_MS = 340;

function MapEventPanel({
  cards,
  timeZone,
  selection,
  presentTopics,
  selectedTopics,
  onToggleTopic,
  onClearTopics,
  mapFilterActive,
  onClearMapFilter,
  onSelectCard,
  onBackFromDetail,
  onCloseDetail,
  onCloseSheet,
  loading = false,
  loadingLabel = "Loading…",
  showTopics = true,
  variant,
  sheetFraction = SHEET_MID,
  onSheetFractionChange,
  onSheetDismiss,
}: MapEventPanelProps) {
  const sheetElRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startTranslate: number;
    lastY: number;
    lastT: number;
    velocity: number;
    lastFrac: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const [stagedSelection, setStagedSelection] =
    useState<DetailSelection | null>(selection);
  const [detailVisible, setDetailVisible] = useState(Boolean(selection));

  useEffect(() => {
    if (selection) {
      setStagedSelection(selection);
      const id = requestAnimationFrame(() => setDetailVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setDetailVisible(false);
    const t = window.setTimeout(() => setStagedSelection(null), STAGE_MS);
    return () => window.clearTimeout(t);
  }, [selection]);

  // Keep DOM transform in sync when React snaps (not while dragging).
  useEffect(() => {
    if (variant !== "sheet" || dragging) return;
    const el = sheetElRef.current;
    if (!el) return;
    el.style.transform = `translate3d(0, ${sheetTranslateY(sheetFraction)}px, 0)`;
  }, [sheetFraction, variant, dragging]);

  const listAnimateKey = useMemo(
    () => cards.map((c) => `${c.id}:${c.startsAt}`).join("|"),
    [cards],
  );

  const selectedId =
    selection?.kind === "event"
      ? selection.id
      : selection
        ? (cards.find((c) => cardMatchesSelection(c, selection))?.id ?? null)
        : null;

  const applyTranslate = (translateY: number) => {
    const el = sheetElRef.current;
    if (!el) return;
    el.style.transform = `translate3d(0, ${translateY}px, 0)`;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (variant !== "sheet" || !onSheetFractionChange) return;
    if ((e.target as HTMLElement).closest("button")) return;

    const startTranslate = sheetTranslateY(sheetFraction);
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTranslate,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      lastFrac: sheetFraction,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    const dyFrame = e.clientY - drag.lastY;
    // Positive velocity = dragging down (closing).
    drag.velocity = dyFrame / dt;
    drag.lastY = e.clientY;
    drag.lastT = now;

    const dy = e.clientY - drag.startY;
    const maxTranslate = SHEET_MAX * window.innerHeight;
    const nextTranslate = Math.min(
      maxTranslate,
      Math.max(0, drag.startTranslate + dy),
    );
    const nextFrac = Math.min(
      SHEET_MAX,
      Math.max(0.08, sheetVisibleFrac(nextTranslate)),
    );
    drag.lastFrac = nextFrac;
    applyTranslate(nextTranslate);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!onSheetFractionChange) return;

    const frac = drag.lastFrac;
    const v = drag.velocity;

    if (frac < SHEET_DISMISS || (v > SHEET_FLING && frac < SHEET_MID + 0.08)) {
      onSheetDismiss?.();
      return;
    }

    let snap: number;
    if (v < -SHEET_FLING) snap = SHEET_MAX;
    else if (v > SHEET_FLING) snap = SHEET_MID;
    else snap = frac >= SHEET_SNAP_UP ? SHEET_MAX : SHEET_MID;

    onSheetFractionChange(snap);
  };

  const listClose = () => {
    if (variant === "sheet" && onCloseSheet) onCloseSheet();
    else onClearMapFilter();
  };

  const detailClose = () => {
    onCloseDetail();
  };

  const shellClass =
    variant === "sheet"
      ? `map-sheet ${dragging ? "is-dragging" : ""} ${detailVisible ? "is-detail" : ""}`
      : `map-sidebar ${detailVisible || stagedSelection ? "map-sidebar--detail" : ""}`;

  return (
    <aside
      ref={(node) => {
        sheetElRef.current = node;
      }}
      className={shellClass}
      style={
        variant === "sheet"
          ? ({
              transform: `translate3d(0, ${sheetTranslateY(sheetFraction)}px, 0)`,
            } as const)
          : undefined
      }
      aria-modal={variant === "sheet" ? true : undefined}
    >
      {variant === "sheet" ? (
        <div
          className="map-sheet__handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="map-sheet__grab" aria-hidden />
          <div className="map-sheet__handle-row">
            <p className="map-sheet__handle-label">
              <EventCountLabel
                count={cards.length}
                loading={loading}
                loadingLabel={loadingLabel}
              />
            </p>
            {!detailVisible && (
              <button
                type="button"
                className="map-sidebar__chrome-close"
                onClick={listClose}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`map-sidebar__header ${detailVisible ? "is-hidden" : ""}`}
          aria-hidden={detailVisible}
        >
          <div className="map-sidebar__header-row">
            <p className="map-sidebar__header-label">
              <EventCountLabel
                count={cards.length}
                loading={loading}
                loadingLabel={loadingLabel}
              />
            </p>
            {mapFilterActive && (
              <button
                type="button"
                className="map-sidebar__chrome-close"
                onClick={onClearMapFilter}
                aria-label="Clear map filter"
                title="Show all events"
              >
                <CloseIcon />
              </button>
            )}
          </div>
          {showTopics && (
            <MapTopicCarousel
              topics={presentTopics}
              selected={selectedTopics}
              onToggle={onToggleTopic}
              onClear={onClearTopics}
            />
          )}
        </div>
      )}

      <div className={`map-sidebar__stage ${detailVisible ? "is-detail" : ""}`}>
        <div
          className={`map-sidebar__layer map-sidebar__layer--list ${
            detailVisible ? "is-behind" : "is-front"
          }`}
          aria-hidden={detailVisible}
        >
          <MapSidebarList
            cards={cards}
            timeZone={timeZone}
            selectedId={selectedId}
            onSelect={onSelectCard}
            animateKey={listAnimateKey}
            loading={loading}
            loadingLabel={loadingLabel}
          />
        </div>

        <div
          className={`map-sidebar__layer map-sidebar__layer--detail ${
            detailVisible ? "is-front" : "is-behind"
          }`}
          aria-hidden={!detailVisible}
        >
          {stagedSelection && (
            <MapSidebarDetail
              selection={stagedSelection}
              cards={cards}
              onBack={onBackFromDetail}
              onClose={detailClose}
              onNavigate={onSelectCard}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

export function MapEventSidebar({
  cards,
  timeZone,
  selection,
  presentTopics,
  selectedTopics,
  onToggleTopic,
  onClearTopics,
  mapFilterActive,
  onClearMapFilter,
  onSelectCard,
  onBackFromDetail,
  onCloseDetail,
  sheetOpen,
  onCloseSheet,
  loading = false,
  loadingLabel = "Loading…",
}: {
  cards: FeedCard[];
  timeZone: string;
  selection: DetailSelection | null;
  presentTopics: FeedTopic[];
  selectedTopics: FeedTopic[];
  onToggleTopic: (topic: FeedTopic) => void;
  onClearTopics: () => void;
  mapFilterActive: boolean;
  onClearMapFilter: () => void;
  onSelectCard: (card: FeedCard) => void;
  onBackFromDetail: () => void;
  onCloseDetail: () => void;
  sheetOpen: boolean;
  onCloseSheet: () => void;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const [sheetFraction, setSheetFraction] = useState(SHEET_MID);

  useEffect(() => {
    if (sheetOpen) setSheetFraction(SHEET_MID);
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const dismissSheet = useCallback(() => {
    onCloseSheet();
  }, [onCloseSheet]);

  const shared = {
    cards,
    timeZone,
    selection,
    presentTopics,
    selectedTopics,
    onToggleTopic,
    onClearTopics,
    mapFilterActive,
    onClearMapFilter,
    onSelectCard,
    onBackFromDetail,
    onCloseDetail,
    loading,
    loadingLabel,
  };

  return (
    <>
      <div className="map-panel map-panel--desktop">
        <MapEventPanel {...shared} variant="sidebar" showTopics />
      </div>

      {sheetOpen && (
        <div className="map-panel map-panel--sheet">
          <button
            type="button"
            className="map-sheet__backdrop"
            aria-label="Close events"
            onClick={dismissSheet}
          />
          <MapEventPanel
            {...shared}
            variant="sheet"
            showTopics={false}
            onCloseSheet={onCloseSheet}
            sheetFraction={sheetFraction}
            onSheetFractionChange={setSheetFraction}
            onSheetDismiss={dismissSheet}
          />
        </div>
      )}
    </>
  );
}
