"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { FeedCard } from "@bored/shared";
import { primaryEventType } from "@bored/shared";
import { api } from "@/lib/api";
import { EventDetailContent } from "./EventDetailContent";
import {
  LumaMeshBackground,
  MESH_PALETTES,
  type MeshPalette,
} from "./LumaMeshBackground";
import { MovieDetailContent } from "./MovieDetailContent";
import { ReelsPlayer } from "./ReelsPlayer";
import type { DetailSelection, EventDetail, FilmDetail } from "./types";

const DEFAULT_MESH: MeshPalette = MESH_PALETTES.event;

export function DetailDrawer({
  selection,
  onClose,
  reelPlaylist = [],
}: {
  selection: DetailSelection;
  onClose: () => void;
  reelPlaylist?: FeedCard[];
}) {
  const titleId = useId();
  const reelCards =
    selection.kind === "event"
      ? reelPlaylist.filter((c) => c.kind !== "movie_showtime")
      : [];
  const reelIndex = reelCards.findIndex((c) => c.id === selection.id);
  const isReelPlayer = reelIndex >= 0;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [film, setFilm] = useState<FilmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isReelPlayer) {
      setLoading(false);
      setError(null);
      setEvent(null);
      setFilm(null);
      return;
    }

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
  }, [selection.kind, selection.id, isReelPlayer]);

  const meshColors = useMemo((): MeshPalette => {
    if (isReelPlayer) return MESH_PALETTES.food;
    if (film) return MESH_PALETTES.movies;
    if (!event) return DEFAULT_MESH;
    const type = primaryEventType({
      categories: event.categories,
      tags: event.tags,
      venueName: event.venueName,
      source: event.source,
      kind: "event",
    });
    return MESH_PALETTES[type.kind] ?? DEFAULT_MESH;
  }, [event, film, isReelPlayer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const apply = () => {
      document.body.style.overflow = mq.matches ? "hidden" : "";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      document.body.style.overflow = "";
      mq.removeEventListener("change", apply);
    };
  }, []);

  return (
    <div className="detail-drawer-root">
      <button
        type="button"
        className="detail-drawer__backdrop"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside
        className={`detail-drawer${isReelPlayer ? " is-reels" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {!isReelPlayer && <LumaMeshBackground colors={meshColors} />}
        <div className="detail-drawer__chrome">
          <p id={titleId} className="eyebrow detail-drawer__label">
            {isReelPlayer ? "Reels" : "Details"}
          </p>
          <button
            type="button"
            className="detail-drawer__close"
            onClick={onClose}
            aria-label="Close"
          >
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
          </button>
        </div>

        {isReelPlayer ? (
          <ReelsPlayer cards={reelCards} initialId={selection.id} />
        ) : (
          <div className="detail-drawer__scroll">
            {loading && <p className="muted">Loading…</p>}
            {error && <p className="muted">{error}</p>}
            {!loading && !error && event && (
              <EventDetailContent event={event} compact />
            )}
            {!loading && !error && film && (
              <MovieDetailContent data={film} compact />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
