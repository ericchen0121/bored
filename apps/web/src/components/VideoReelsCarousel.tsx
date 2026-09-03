"use client";

import type { FeedCard } from "@bored/shared";
import { feedCardPosterUrl, recordFeedSignal } from "@/lib/api";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** Dwell before counting as impressed. */
const IMPRESS_DWELL_MS = 600;

function useImpressWhenVisible(
  rootRef: RefObject<Element | null>,
  eventId: string,
) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const sentRef = useRef(false);

  const setRef = useCallback((el: HTMLElement | null) => {
    setTarget(el);
  }, []);

  useEffect(() => {
    if (sentRef.current || !target) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const root = rootRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          return;
        }
        if (sentRef.current || timer) return;
        timer = setTimeout(() => {
          if (sentRef.current) return;
          sentRef.current = true;
          recordFeedSignal({
            targetKind: "event",
            targetId: eventId,
            type: "impressed",
          });
          observer.disconnect();
        }, IMPRESS_DWELL_MS);
      },
      {
        root,
        rootMargin: "0px",
        threshold: 0.55,
      },
    );
    observer.observe(target);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [eventId, rootRef, target]);

  return setRef;
}

function CarouselTile({
  card,
  selected,
  onSelect,
  scrollRootRef,
}: {
  card: FeedCard;
  selected: boolean;
  onSelect: (card: FeedCard) => void;
  scrollRootRef: RefObject<Element | null>;
}) {
  const basePosterUrl = feedCardPosterUrl(card);
  const setImpressRef = useImpressWhenVisible(scrollRootRef, card.id);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterRetry, setPosterRetry] = useState(0);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setPosterFailed(false);
    setPosterRetry(0);
    setPosterLoaded(false);
  }, [basePosterUrl]);

  const posterUrl =
    basePosterUrl && posterRetry > 0
      ? `${basePosterUrl}${basePosterUrl.includes("?") ? "&" : "?"}r=${posterRetry}`
      : basePosterUrl;

  const showImg = Boolean(posterUrl) && !posterFailed;

  useEffect(() => {
    if (!showImg) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setPosterLoaded(true);
  }, [showImg, posterUrl]);

  return (
    <article
      ref={setImpressRef}
      className={`reels-carousel__tile${selected ? " is-selected" : ""}`}
    >
      <button
        type="button"
        className="reels-carousel__hit"
        onClick={() => onSelect(card)}
        aria-pressed={selected}
        aria-label={`Open ${card.title}`}
      >
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            className={`reels-carousel__poster${posterLoaded ? " is-loaded" : ""}`}
            src={posterUrl!}
            alt=""
            decoding="async"
            onLoad={() => setPosterLoaded(true)}
            onError={() => {
              if (posterRetry < 1) {
                setPosterLoaded(false);
                setPosterRetry(1);
                return;
              }
              setPosterFailed(true);
            }}
          />
        ) : (
          <div className="reels-carousel__poster reels-carousel__poster--empty" />
        )}
        <span className="reels-carousel__play" aria-hidden>
          ▶
        </span>
      </button>
    </article>
  );
}

export function VideoReelsCarousel({
  cards,
  onSelect,
  isSelected,
  layout = "carousel",
  hideHeader = false,
  headerActions,
  title = "Reels & shorts",
  loading = false,
  skeletonCount = 8,
}: {
  cards: FeedCard[];
  onSelect: (card: FeedCard) => void;
  isSelected: (card: FeedCard) => boolean;
  /** Horizontal one-line scroller, or wrap into a grid (Show all). */
  layout?: "carousel" | "grid";
  /** When true, omit the built-in title/nav — parent owns the section chrome. */
  hideHeader?: boolean;
  headerActions?: ReactNode;
  title?: string;
  /** Show poster placeholders while the videos request is in flight. */
  loading?: boolean;
  skeletonCount?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const nullRootRef = useRef<Element | null>(null);
  const isGrid = layout === "grid";
  const scrollRootRef = isGrid ? nullRootRef : trackRef;

  if (!loading && cards.length === 0) return null;

  const scrollBy = (dir: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const tile = track.querySelector<HTMLElement>(".reels-carousel__tile");
    const step = tile ? tile.offsetWidth + 10 : 160;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const tiles = loading
    ? Array.from({ length: skeletonCount }, (_, i) => (
        <div
          key={`skel-${i}`}
          className="reels-carousel__tile reels-carousel__tile--skeleton"
          aria-hidden
        >
          <div className="reels-carousel__hit is-skeleton">
            <div className="reels-carousel__poster reels-carousel__poster--empty" />
          </div>
        </div>
      ))
    : cards.map((card) => (
        <CarouselTile
          key={`${card.id}:${card.startsAt}`}
          card={card}
          selected={isSelected(card)}
          onSelect={onSelect}
          scrollRootRef={scrollRootRef}
        />
      ));

  return (
    <section
      className={`reels-carousel${isGrid ? " reels-carousel--grid" : ""}`}
      aria-label="Reels and shorts"
      aria-busy={loading}
    >
      {!hideHeader ? (
        <div className="reels-carousel__header">
          <h2 className="section-title">{title}</h2>
          <div className="reels-carousel__header-actions">
            {headerActions}
            {!isGrid && !loading && cards.length > 3 ? (
              <div className="reels-carousel__nav">
                <button
                  type="button"
                  className="reels-carousel__arrow"
                  aria-label="Previous reels"
                  onClick={() => scrollBy(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="reels-carousel__arrow"
                  aria-label="Next reels"
                  onClick={() => scrollBy(1)}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {isGrid ? (
        <div className="reels-carousel__grid">{tiles}</div>
      ) : (
        <div ref={trackRef} className="reels-carousel__track">
          {tiles}
        </div>
      )}
    </section>
  );
}
