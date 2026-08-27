"use client";

import { useState } from "react";
import type { FeedCard } from "@bored/shared";
import { FeedCardView } from "@/components/FeedCardView";
import type { DetailSelection } from "@/components/detail/types";

/** Show this many movie cards before collapsing the rest (iOS-style). */
const PREVIEW_COUNT = 2;

function cardSelected(card: FeedCard, selected: DetailSelection | null) {
  if (!selected || selected.kind !== "movie") return false;
  return card.filmId === selected.id || card.id === selected.id;
}

export function MoviesSection({
  movies,
  selected = null,
  onSelect,
  timeZone = "America/Los_Angeles",
}: {
  movies: FeedCard[];
  selected?: DetailSelection | null;
  onSelect?: (card: FeedCard) => void;
  timeZone?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (movies.length === 0) return null;

  const needsCollapse = movies.length > PREVIEW_COUNT;
  const visible =
    expanded || !needsCollapse ? movies : movies.slice(0, PREVIEW_COUNT);
  const hiddenCount = movies.length - PREVIEW_COUNT;

  return (
    <section className="movies-section" aria-label="Movies">
      <div className="movies-section__header">
        <h2 className="section-title">Movies near you</h2>
        {needsCollapse && (
          <button
            type="button"
            className="movies-section__toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : `${movies.length} playing`}
          </button>
        )}
      </div>

      <div className={`movies-stack ${expanded ? "is-expanded" : ""}`}>
        {visible.map((card, i) => (
          <FeedCardView
            key={card.id}
            card={card}
            selected={cardSelected(card, selected)}
            onSelect={onSelect}
            timeZone={timeZone}
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}

        {!expanded && needsCollapse && (
          <button
            type="button"
            className="movies-collapse"
            onClick={() => setExpanded(true)}
            aria-label={`Show ${hiddenCount} more movies`}
          >
            <span className="movies-collapse__stack" aria-hidden>
              {movies.slice(PREVIEW_COUNT, PREVIEW_COUNT + 3).map((card, i) => (
                <span
                  key={card.id}
                  className="movies-collapse__sheet"
                  style={{
                    transform: `translateY(${i * 6}px) scale(${1 - i * 0.03})`,
                    zIndex: 3 - i,
                    opacity: 1 - i * 0.18,
                  }}
                >
                  {card.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.imageUrl} alt="" />
                  ) : (
                    <span className="movies-collapse__placeholder" />
                  )}
                </span>
              ))}
            </span>
            <span className="movies-collapse__label">
              {hiddenCount} more {hiddenCount === 1 ? "movie" : "movies"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
