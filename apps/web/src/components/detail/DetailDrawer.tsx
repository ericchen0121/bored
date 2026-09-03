"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FeedCard } from "@bored/shared";
import { primaryEventType } from "@bored/shared";
import { api } from "@/lib/api";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
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
  const panelRef = useRef<HTMLElement | null>(null);
  const backdropRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const isMobile = useMediaQuery("(max-width: 899px)");

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

  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

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

  // Freeze feed scroll while the mobile sheet is open so unlock doesn't jump.
  useEffect(() => {
    if (!isMobile) return;
    const { body } = document;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isMobile]);

  // Reels use vertical swipe for next/prev — only dismiss from chrome, not content.
  const {
    dragging,
    dismiss,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useSwipeToDismiss({
    enabled: isMobile,
    onDismiss: finishClose,
    panelRef,
    backdropRef,
    scrollRef: isReelPlayer ? undefined : scrollRef,
  });

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (isMobile) {
      dismiss();
      return;
    }
    finishClose();
  }, [isMobile, dismiss, finishClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return (
    <div className="detail-drawer-root">
      <button
        type="button"
        ref={backdropRef}
        className="detail-drawer__backdrop"
        aria-label="Close details"
        onClick={requestClose}
      />
      <aside
        ref={panelRef}
        className={`detail-drawer${isReelPlayer ? " is-reels" : ""}${
          dragging ? " is-dragging" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {!isReelPlayer && <LumaMeshBackground colors={meshColors} />}
        <div
          className="detail-drawer__chrome"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <span className="detail-drawer__grab" aria-hidden />
          <div className="detail-drawer__chrome-row">
            <p id={titleId} className="eyebrow detail-drawer__label">
              {isReelPlayer ? "Reels" : "Details"}
            </p>
            <button
              type="button"
              className="detail-drawer__close"
              onClick={requestClose}
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
        </div>

        {isReelPlayer ? (
          <ReelsPlayer cards={reelCards} initialId={selection.id} />
        ) : (
          <div
            ref={scrollRef}
            className="detail-drawer__scroll"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
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
        )}
      </aside>
    </div>
  );
}
