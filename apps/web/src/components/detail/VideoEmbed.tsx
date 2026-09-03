"use client";

import {
  feedVideoPosterUrl,
  isFeedVideo,
  youtubeEmbedUrl,
  youtubeVideoIdFromUrl,
} from "@bored/shared";
import { useMemo, useState } from "react";
import {
  instagramMediaPosterUrl,
  instagramMediaStreamUrl,
} from "@/lib/api";
import { eventOutboundHref } from "@/lib/outbound";

export function VideoEmbed({
  source,
  url,
  title,
  posterUrl,
  videoId,
  eventId,
}: {
  source: string;
  url: string;
  title: string;
  posterUrl?: string | null;
  mediaUrl?: string | null;
  videoId?: string | null;
  eventId?: string;
}) {
  const [nativeFailed, setNativeFailed] = useState(false);

  const ytId = useMemo(
    () => videoId ?? youtubeVideoIdFromUrl(url),
    [videoId, url],
  );
  const ytEmbed = useMemo(
    () => youtubeEmbedUrl(ytId, { autoplay: true, mute: true }),
    [ytId],
  );
  const streamUrl =
    source === "instagram" && eventId
      ? instagramMediaStreamUrl(eventId)
      : null;
  const safePoster =
    source === "instagram" && eventId
      ? instagramMediaPosterUrl(eventId)
      : posterUrl && !/cdninstagram\.com|fbcdn\.net/i.test(posterUrl)
        ? posterUrl
        : feedVideoPosterUrl({ source, imageUrl: posterUrl, url });

  if (source === "youtube" && ytEmbed) {
    return (
      <section className="detail-body__reel" aria-label="YouTube short">
        <div className="detail-body__reel-frame detail-body__reel-frame--embed">
          <iframe
            src={ytEmbed}
            title={`YouTube: ${title}`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </section>
    );
  }

  if (streamUrl && !nativeFailed) {
    return (
      <section className="detail-body__reel" aria-label="Instagram reel">
        <div className="detail-body__reel-frame">
          <video
            className="detail-body__reel-video"
            src={streamUrl}
            poster={safePoster ?? undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setNativeFailed(true)}
          />
        </div>
      </section>
    );
  }

  if (source === "instagram" && (eventId || url)) {
    return (
      <section className="detail-body__reel" aria-label="Instagram reel">
        <div className="detail-body__reel-frame detail-body__reel-frame--cta">
          {safePoster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="detail-body__reel-video" src={safePoster} alt="" />
          ) : null}
          <div className="detail-body__reel-cta">
            <p>Couldn&apos;t load this reel.</p>
            <a
              className="btn"
              href={eventId ? eventOutboundHref(eventId) : url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch on Instagram
            </a>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

export function isDetailVideo(opts: {
  source?: string | null;
  tags?: string[] | null;
  url?: string | null;
  rawPayload?: {
    mediaType?: unknown;
    foodTip?: unknown;
    isShort?: unknown;
    videoId?: unknown;
  } | null;
}): boolean {
  return (
    isFeedVideo({
      source: opts.source,
      tags: opts.tags,
      rawPayload: opts.rawPayload,
    }) && Boolean(opts.url?.trim())
  );
}
