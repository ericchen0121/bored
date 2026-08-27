"use client";

import { instagramEmbedUrl } from "@bored/shared";
import { useMemo, useState } from "react";

export function InstagramReelEmbed({
  permalink,
  title,
  posterUrl,
  mediaUrl,
}: {
  permalink: string;
  title: string;
  posterUrl?: string | null;
  mediaUrl?: string | null;
}) {
  const embedSrc = useMemo(() => instagramEmbedUrl(permalink), [permalink]);
  const [nativeFailed, setNativeFailed] = useState(false);

  const tryNative =
    Boolean(mediaUrl?.trim()) &&
    !nativeFailed &&
    typeof mediaUrl === "string";

  if (tryNative) {
    return (
      <section className="detail-body__reel" aria-label="Instagram reel">
        <div className="detail-body__reel-frame">
          <video
            className="detail-body__reel-video"
            src={mediaUrl!}
            poster={posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setNativeFailed(true)}
          />
        </div>
      </section>
    );
  }

  if (!embedSrc) return null;

  return (
    <section className="detail-body__reel" aria-label="Instagram reel">
      <div className="detail-body__reel-frame detail-body__reel-frame--embed">
        <iframe
          src={embedSrc}
          title={`Instagram reel: ${title}`}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}
