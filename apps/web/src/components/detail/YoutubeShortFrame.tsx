"use client";

import {
  isYoutubeEmbedFatalError,
  youtubeEmbedUrl,
} from "@bored/shared";
import { useEffect, useId, useRef, useState } from "react";

type YtPlayer = {
  destroy: () => void;
};

type YtNamespace = {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onError?: (e: { data: number }) => void;
        onReady?: (e: { target: { mute?: () => void; playVideo?: () => void } }) => void;
      };
    },
  ) => YtPlayer;
  PlayerState?: { PLAYING: number };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtNamespace> | null = null;

function loadYoutubeApi(): Promise<YtNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YT API missing Player"));
    };
    if (!document.querySelector('script[data-bored-yt-api="1"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.dataset.boredYtApi = "1";
      s.onerror = () => reject(new Error("YT API script failed"));
      document.head.appendChild(s);
    }
    // Already mid-load (script present, callback pending).
    const start = Date.now();
    const tick = () => {
      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }
      if (Date.now() - start > 12_000) {
        reject(new Error("YT API timeout"));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return apiPromise;
}

/**
 * YouTube Short embed with IFrame API error handling.
 * Owners who disable embedding surface YT's "Video unavailable" UI otherwise.
 */
export function YoutubeShortFrame({
  videoId,
  title,
  autoplay,
  mute = true,
  controls = true,
  className,
  onFatalError,
}: {
  videoId: string;
  title: string;
  autoplay?: boolean;
  mute?: boolean;
  controls?: boolean;
  className?: string;
  onFatalError?: () => void;
}) {
  const reactId = useId();
  const hostId = `bored-yt-${reactId.replace(/:/g, "")}`;
  const playerRef = useRef<YtPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);

  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;

  useEffect(() => {
    setFailed(false);
    setApiFailed(false);
  }, [videoId]);

  useEffect(() => {
    if (failed || apiFailed) return;
    let cancelled = false;

    void loadYoutubeApi()
      .then((YT) => {
        if (cancelled) return;
        const host = document.getElementById(hostId);
        if (!host) return;

        playerRef.current?.destroy();
        playerRef.current = new YT.Player(hostId, {
          videoId,
          playerVars: {
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            controls: controls ? 1 : 0,
            autoplay: autoplay ? 1 : 0,
            mute: mute ? 1 : 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (mute) e.target.mute?.();
              if (autoplay) e.target.playVideo?.();
            },
            onError: (e) => {
              if (isYoutubeEmbedFatalError(e.data)) {
                setFailed(true);
                onFatalErrorRef.current?.();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setApiFailed(true);
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* player may already be gone */
      }
      playerRef.current = null;
    };
  }, [videoId, autoplay, mute, controls, hostId, failed, apiFailed]);

  // API load failed — plain iframe (may still show YT's unavailable UI).
  if (apiFailed && !failed) {
    const src = youtubeEmbedUrl(videoId, {
      autoplay,
      mute,
      controls,
      origin: typeof window !== "undefined" ? window.location.origin : null,
    });
    if (!src) return null;
    return (
      <iframe
        className={className}
        src={src}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  if (failed) return null;

  // YT.Player replaces the inner host with an iframe — keep className on the wrapper.
  return (
    <div className={className} title={title}>
      <div id={hostId} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
