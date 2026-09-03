"use client";

/**
 * @deprecated Prefer VideoEmbed / ReelsPlayer — they use the API media proxy.
 * Kept as a thin wrapper so older imports don't regress to CDN playback.
 */
import { VideoEmbed } from "./VideoEmbed";

export function InstagramReelEmbed({
  permalink,
  title,
  posterUrl,
  eventId,
}: {
  permalink: string;
  title: string;
  posterUrl?: string | null;
  mediaUrl?: string | null;
  eventId?: string;
}) {
  return (
    <VideoEmbed
      source="instagram"
      url={permalink}
      title={title}
      posterUrl={posterUrl}
      eventId={eventId}
    />
  );
}
