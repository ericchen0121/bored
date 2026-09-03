"use client";

import type { FeedCard } from "@bored/shared";
import {
  feedVideoPosterUrl,
  formatTimeAgo,
  youtubeEmbedUrl,
  youtubeVideoIdFromUrl,
} from "@bored/shared";
import { SaveButton } from "@/components/SaveButton";
import {
  instagramMediaPosterUrl,
  instagramMediaStreamUrl,
} from "@/lib/api";
import { eventOutboundHref } from "@/lib/outbound";
import { ReelInfoSheet } from "@/components/detail/ReelInfoSheet";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Pause + mute every video in the scroller except the optional keep target. */
function silenceOtherVideos(
  scroller: HTMLElement | null,
  keep: HTMLVideoElement | null = null,
) {
  if (!scroller) return;
  for (const v of scroller.querySelectorAll("video")) {
    if (v === keep) continue;
    v.pause();
    v.muted = true;
  }
}

function ReelScrubber({
  videoRef,
  active,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active) {
      setProgress(0);
      return;
    }

    const tick = () => {
      if (scrubbing.current) return;
      const dur = el.duration;
      if (!Number.isFinite(dur) || dur <= 0) {
        setProgress(0);
        return;
      }
      setProgress(el.currentTime / dur);
    };

    tick();
    el.addEventListener("timeupdate", tick);
    el.addEventListener("loadedmetadata", tick);
    el.addEventListener("durationchange", tick);
    return () => {
      el.removeEventListener("timeupdate", tick);
      el.removeEventListener("loadedmetadata", tick);
      el.removeEventListener("durationchange", tick);
    };
  }, [videoRef, active]);

  function seekFromClientX(clientX: number) {
    const el = videoRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * dur;
    setProgress(ratio);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    scrubbing.current = true;
    trackRef.current?.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbing.current) return;
    e.preventDefault();
    seekFromClientX(e.clientX);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <div
      ref={trackRef}
      className="reels-player__scrub"
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="reels-player__scrub-track" aria-hidden>
        <div
          className="reels-player__scrub-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

function ReelSlideMedia({
  card,
  active,
  muted,
  onUserActivate,
}: {
  card: FeedCard;
  active: boolean;
  muted: boolean;
  onUserActivate: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [nativeFailed, setNativeFailed] = useState(false);

  const ytId = youtubeVideoIdFromUrl(card.url);
  const ytSrc =
    card.source === "youtube"
      ? youtubeEmbedUrl(ytId, {
          autoplay: active,
          mute: muted,
          controls: false,
        })
      : null;

  // Always use API proxies — Instagram CDN blocks cross-origin media (CORP).
  const streamUrl =
    card.source === "instagram" ? instagramMediaStreamUrl(card.id) : null;
  const posterUrl =
    card.source === "instagram"
      ? instagramMediaPosterUrl(card.id)
      : feedVideoPosterUrl(card);

  useEffect(() => {
    setNativeFailed(false);
  }, [card.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || card.source !== "instagram") return;
    if (active && !nativeFailed && streamUrl) {
      el.muted = muted;
      void el.play().catch(() => {
        // Autoplay with sound often needs a direct gesture; fall back muted.
        if (!el.muted) {
          el.muted = true;
          void el.play().catch(() => {});
        }
      });
    } else {
      el.pause();
      el.muted = true;
    }
  }, [active, muted, nativeFailed, streamUrl, card.source]);

  const hitProps = {
    className: "reels-player__hit",
    type: "button" as const,
    "aria-label": muted ? "Unmute video" : "Play video",
    onClick: () => {
      onUserActivate();
      const el = videoRef.current;
      if (el && card.source === "instagram" && !nativeFailed) {
        silenceOtherVideos(el.closest(".reels-player"), el);
        el.muted = false;
        void el.play().catch(() => {});
      }
    },
  };

  if (ytSrc && active) {
    return (
      <>
        <iframe
          key={`${card.id}:play:${muted ? "m" : "u"}`}
          className="reels-player__media"
          src={ytSrc}
          title={card.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <button {...hitProps} />
      </>
    );
  }

  if (card.source === "youtube") {
    return (
      <>
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="reels-player__media" src={posterUrl} alt="" />
        ) : (
          <div className="reels-player__media reels-player__media--empty" />
        )}
        <button {...hitProps} />
      </>
    );
  }

  if (streamUrl && !nativeFailed) {
    return (
      <>
        <video
          key={streamUrl}
          ref={videoRef}
          className="reels-player__media"
          src={streamUrl}
          poster={posterUrl ?? undefined}
          playsInline
          loop
          muted={muted || !active}
          preload={active ? "auto" : "metadata"}
          onError={() => setNativeFailed(true)}
        />
        <button {...hitProps} />
        {active ? <ReelScrubber videoRef={videoRef} active={active} /> : null}
      </>
    );
  }

  return (
    <div className="reels-player__fallback">
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="reels-player__media" src={posterUrl} alt="" />
      ) : (
        <div className="reels-player__media reels-player__media--empty" />
      )}
      <div className="reels-player__fallback-cta">
        <p className="reels-player__ig-note">Couldn&apos;t load this reel.</p>
        <a
          className="btn reels-player__watch-btn"
          href={eventOutboundHref(card.id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch on Instagram
        </a>
      </div>
    </div>
  );
}

const SWIPE_DISTANCE_PX = 48;
const WHEEL_DELTA_THRESHOLD = 28;

export function ReelsPlayer({
  cards,
  initialId,
  onActiveId,
}: {
  cards: FeedCard[];
  initialId: string;
  onActiveId?: (id: string) => void;
}) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(() => {
    const i = cards.findIndex((c) => c.id === initialId);
    return i >= 0 ? i : 0;
  });
  /** Start muted for autoplay policy; unmute after click or advance. */
  const [muted, setMuted] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoOpenRef = useRef(false);
  infoOpenRef.current = infoOpen;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onActiveIdRef = useRef(onActiveId);
  onActiveIdRef.current = onActiveId;
  const animatingRef = useRef(false);
  const swipeRef = useRef<{
    pointerId: number;
    startY: number;
    startX: number;
    armed: boolean;
  } | null>(null);

  function scrollToIndex(index: number, behavior: ScrollBehavior = "smooth") {
    const scroller = scrollerRef.current;
    const slide = scroller?.children[index] as HTMLElement | undefined;
    if (!scroller || !slide) return;
    scroller.scrollTo({ top: slide.offsetTop, behavior });
  }

  function activateIndex(next: number, opts?: { unmute?: boolean }) {
    const list = cardsRef.current;
    if (next < 0 || next >= list.length) return;
    if (next === activeIndexRef.current && !opts?.unmute) {
      scrollToIndex(next);
      return;
    }

    const scroller = scrollerRef.current;
    const slide = scroller?.children[next] as HTMLElement | undefined;
    const video = slide?.querySelector("video") ?? null;

    // Kill every other clip first so audio never overlaps during the transition.
    silenceOtherVideos(scroller, video);

    if (opts?.unmute !== false) {
      setMuted(false);
      if (video) {
        video.muted = false;
        void video.play().catch(() => {});
      }
    }

    activeIndexRef.current = next;
    setActiveIndex(next);
    onActiveIdRef.current?.(list[next]!.id);
    animatingRef.current = true;
    scrollToIndex(next);
    window.setTimeout(() => {
      animatingRef.current = false;
      // Snap again in case layout shifted; keep only the active clip alive.
      scrollToIndex(next, "auto");
      const keep =
        (scrollerRef.current?.children[next] as HTMLElement | undefined)
          ?.querySelector("video") ?? null;
      silenceOtherVideos(scrollerRef.current, keep);
    }, 480);
  }

  function go(dir: -1 | 1) {
    if (animatingRef.current || infoOpenRef.current) return;
    const next = Math.min(
      cardsRef.current.length - 1,
      Math.max(0, activeIndexRef.current + dir),
    );
    if (next === activeIndexRef.current) return;
    activateIndex(next);
  }

  useEffect(() => {
    setInfoOpen(false);
  }, [activeIndex]);

  useEffect(() => {
    const i = cards.findIndex((c) => c.id === initialId);
    if (i < 0) return;
    activeIndexRef.current = i;
    setActiveIndex(i);
    // Instant jump when opening / changing selection — no fling.
    requestAnimationFrame(() => scrollToIndex(i, "auto"));
  }, [initialId, cards]);

  // One-step navigation only: wheel / keys / swipe never skip slides.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        go(-1);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < WHEEL_DELTA_THRESHOLD) return;
      go(e.deltaY > 0 ? 1 : -1);
    };

    const isChromeTarget = (t: EventTarget | null) =>
      t instanceof Element &&
      Boolean(
        t.closest(
          ".reels-player__scrub, .reels-player__save, .reels-player__meta, .reels-player__watch-btn, .reels-info, .save-heart",
        ),
      );

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (isChromeTarget(e.target)) return;
      swipeRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startX: e.clientX,
        armed: true,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const swipe = swipeRef.current;
      if (!swipe?.armed || swipe.pointerId !== e.pointerId) return;
      const dy = e.clientY - swipe.startY;
      const dx = e.clientX - swipe.startX;
      // Lock vertical once it dominates so the page doesn't rubber-band.
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        e.preventDefault();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const swipe = swipeRef.current;
      if (!swipe?.armed || swipe.pointerId !== e.pointerId) return;
      swipeRef.current = null;
      const dy = swipe.startY - e.clientY;
      const dx = Math.abs(e.clientX - swipe.startX);
      if (Math.abs(dy) < SWIPE_DISTANCE_PX || Math.abs(dy) < dx) {
        // Cancelled / horizontal — stay snapped on the current reel.
        scrollToIndex(activeIndexRef.current, "smooth");
        return;
      }
      // Any flick past the threshold advances exactly one reel.
      go(dy > 0 ? 1 : -1);
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (swipeRef.current?.pointerId === e.pointerId) {
        swipeRef.current = null;
        scrollToIndex(activeIndexRef.current, "smooth");
      }
    };

    // Block native momentum scrolling that would skip snap points.
    const onScroll = () => {
      if (animatingRef.current) return;
      scrollToIndex(activeIndexRef.current, "auto");
    };

    window.addEventListener("keydown", onKey);
    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("pointerdown", onPointerDown);
    scroller.addEventListener("pointermove", onPointerMove, { passive: false });
    scroller.addEventListener("pointerup", onPointerUp);
    scroller.addEventListener("pointercancel", onPointerCancel);
    scroller.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("pointermove", onPointerMove);
      scroller.removeEventListener("pointerup", onPointerUp);
      scroller.removeEventListener("pointercancel", onPointerCancel);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Whenever the active slide changes, ensure siblings are silenced.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const keep =
      (scroller?.children[activeIndex] as HTMLElement | undefined)?.querySelector(
        "video",
      ) ?? null;
    silenceOtherVideos(scroller, keep);
  }, [activeIndex]);

  if (cards.length === 0) return null;

  const activeCard = cards[activeIndex];

  return (
    <div
      ref={scrollerRef}
      className="reels-player"
      role="feed"
      aria-label="Reels"
    >
      {cards.map((card, i) => {
        const posted = formatTimeAgo(card.publishedAt);
        return (
          <article
            key={card.id}
            className={`reels-player__slide${i === activeIndex ? " is-active" : ""}`}
            aria-label={card.title}
          >
            <ReelSlideMedia
              card={card}
              active={i === activeIndex}
              muted={muted}
              onUserActivate={() => setMuted(false)}
            />
            <SaveButton
              targetKind="event"
              targetId={card.id}
              returnTo={pathname || undefined}
              className="reels-player__save"
              tooltip
            />
            <div className="reels-player__chrome">
              <button
                type="button"
                className="reels-player__meta"
                onClick={() => {
                  if (i === activeIndex) setInfoOpen(true);
                }}
                aria-label={`More about ${card.title}`}
              >
                <p className="reels-player__source">
                  {card.recommendationLabel ??
                    (card.source === "youtube" ? "YouTube Short" : "Reel")}
                  {posted ? ` · ${posted}` : null}
                </p>
                <h3 className="reels-player__title">{card.title}</h3>
                {(card.venueName || card.neighborhood) && (
                  <p className="reels-player__place">
                    {[card.venueName, card.neighborhood]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <span className="reels-player__more">Details</span>
              </button>
            </div>
          </article>
        );
      })}
      {infoOpen && activeCard ? (
        <ReelInfoSheet
          eventId={activeCard.id}
          fallbackTitle={activeCard.title}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  );
}
