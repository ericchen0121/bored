"use client";

import { formatTimeAgo } from "@bored/shared";
import { api } from "@/lib/api";
import { eventOutboundHref } from "@/lib/outbound";
import { useEffect, useState } from "react";
import type { EventDetail } from "./types";

export function ReelInfoSheet({
  eventId,
  fallbackTitle,
  onClose,
}: {
  eventId: string;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvent(null);
    void api<EventDetail>(`/v1/events/${eventId}`)
      .then((data) => {
        if (!cancelled) setEvent(data);
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
  }, [eventId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handle =
    (typeof event?.rawPayload?.handle === "string"
      ? event.rawPayload.handle
      : event?.organizer?.replace(/^@/, "")) ?? null;
  const published =
    typeof event?.rawPayload?.published === "string"
      ? event.rawPayload.published
      : null;
  const timeago = formatTimeAgo(published);
  const place = [event?.venueName, event?.neighborhood]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="reels-info">
      <button
        type="button"
        className="reels-info__scrim"
        aria-label="Close reel details"
        onClick={onClose}
      />
      <div
        className="reels-info__sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Reel details"
      >
        <div className="reels-info__handle">
          <span className="reels-info__grip" aria-hidden />
          <button
            type="button"
            className="reels-info__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {loading && <p className="reels-info__muted">Loading…</p>}
        {error && <p className="reels-info__muted">{error}</p>}

        {!loading && !error && (
          <>
            <p className="reels-info__source">
              {handle ? `@${handle.replace(/^@/, "")}` : "Reel"}
              {timeago ? ` · ${timeago}` : null}
            </p>
            <h3 className="reels-info__title">
              {event?.title ?? fallbackTitle}
            </h3>
            {place ? <p className="reels-info__place">{place}</p> : null}
            {event?.description ? (
              <p className="reels-info__caption">{event.description}</p>
            ) : null}
            <a
              className="btn reels-info__cta"
              href={eventOutboundHref(eventId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {event?.source === "youtube"
                ? "Watch on YouTube"
                : "Open on Instagram"}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
