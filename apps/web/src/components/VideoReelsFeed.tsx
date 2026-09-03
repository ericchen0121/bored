"use client";

import type { FeedCard } from "@bored/shared";
import { isFeedVideoCard } from "@bored/shared";
import { feedCardPosterUrl, recordFeedSignal } from "@/lib/api";
import { cardEventType, posterPlaceholderLabel } from "@/lib/evergreen-poster";
import { CardPosterPlaceholder } from "@/components/EventPosterMedia";
import { useEffect, useRef, useState } from "react";

const IMPRESS_DWELL_MS = 600;

function useImpress(eventId: string) {
  const ref = useRef<HTMLElement | null>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
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
      { threshold: 0.55 },
    );
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [eventId]);

  return ref;
}

function ReelsSlide({
  card,
  onSelect,
  selected,
}: {
  card: FeedCard;
  onSelect: (card: FeedCard) => void;
  selected: boolean;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const posterUrl = feedCardPosterUrl(card);
  const impressRef = useImpress(card.id);
  const eventType = cardEventType({
    categories: card.categories,
    tags: card.tags,
    venueName: card.venueName,
    source: card.source,
    kind: card.kind,
  });

  const sourceLabel =
    card.recommendationLabel ??
    (card.source === "youtube" ? "YouTube Short" : "Reel");

  return (
    <article
      ref={impressRef}
      className={`reels-feed__slide${selected ? " is-selected" : ""}`}
      aria-label={card.title}
    >
      <button
        type="button"
        className="reels-feed__media"
        onClick={() => onSelect(card)}
        aria-pressed={selected}
        aria-label={`Open ${card.title}`}
      >
        {posterUrl && !posterFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="reels-feed__poster"
            src={posterUrl}
            alt=""
            loading="lazy"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <CardPosterPlaceholder
            kind={eventType.kind}
            className={`reels-feed__poster ${eventType.className}`}
            label={posterPlaceholderLabel(card)}
            extraClassName="reels-feed__poster--empty"
          />
        )}

        <span className="reels-feed__play" aria-hidden>
          ▶
        </span>

        <div className="reels-feed__gradient" aria-hidden />

        <div className="reels-feed__copy">
          <p className="reels-feed__source">{sourceLabel}</p>
          <h3 className="reels-feed__title">{card.title}</h3>
          {(card.venueName || card.neighborhood) && (
            <p className="reels-feed__place">
              {[card.venueName, card.neighborhood].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </button>
    </article>
  );
}

export function VideoReelsFeed({
  cards,
  onSelect,
  isSelected,
}: {
  cards: FeedCard[];
  onSelect: (card: FeedCard) => void;
  isSelected: (card: FeedCard) => boolean;
}) {
  const videoCards = cards.filter(isFeedVideoCard);

  if (videoCards.length === 0) {
    return (
      <p className="muted reels-feed__empty">
        No reels or shorts yet — food openings and city guides appear here after
        ingest runs with Instagram / YouTube credentials.
      </p>
    );
  }

  return (
    <div className="reels-feed" role="feed" aria-label="Reels and shorts">
      {videoCards.map((card) => (
        <ReelsSlide
          key={`${card.id}:${card.startsAt}`}
          card={card}
          onSelect={onSelect}
          selected={isSelected(card)}
        />
      ))}
    </div>
  );
}
