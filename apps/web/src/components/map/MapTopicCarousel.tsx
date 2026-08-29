"use client";

import type { FeedTopic } from "@bored/shared";
import { FEED_TOPIC_EMOJI, FEED_TOPIC_LABELS } from "@bored/shared";

export function MapTopicCarousel({
  topics,
  selected,
  onToggle,
  onClear,
}: {
  topics: FeedTopic[];
  selected: FeedTopic[];
  onToggle: (topic: FeedTopic) => void;
  onClear: () => void;
}) {
  const allActive = selected.length === 0;

  return (
    <nav className="map-topic-carousel" aria-label="Topics">
      <div className="map-topic-carousel__track">
        <button
          type="button"
          className={`map-topic-carousel__chip ${allActive ? "is-active" : ""}`}
          aria-pressed={allActive}
          onClick={onClear}
        >
          All
        </button>
        {topics.map((id) => {
          const active = selected.length === 1 && selected[0] === id;
          return (
            <button
              key={id}
              type="button"
              className={`map-topic-carousel__chip ${active ? "is-active" : ""}`}
              aria-pressed={active}
              onClick={() => onToggle(id)}
            >
              <span aria-hidden>{FEED_TOPIC_EMOJI[id]}</span>{" "}
              {FEED_TOPIC_LABELS[id]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
