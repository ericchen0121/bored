/** Instagram reel / video helpers for feed + detail UI. */

export function instagramShortcodeFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  try {
    const parts = new URL(url.trim()).pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["p", "reel", "tv"].includes(parts[0]!)) {
      return parts[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Official Instagram embed player URL for inline playback. */
export function instagramEmbedUrl(
  permalink: string | null | undefined,
): string | null {
  const shortcode = instagramShortcodeFromUrl(permalink);
  if (!shortcode) return null;
  try {
    const parts = new URL(permalink!.trim()).pathname.split("/").filter(Boolean);
    const kind = parts[0] ?? "p";
    return `https://www.instagram.com/${kind}/${shortcode}/embed`;
  } catch {
    return null;
  }
}

export function isInstagramVideo(opts: {
  source?: string | null;
  tags?: string[] | null;
  rawPayload?: { mediaType?: unknown; foodTip?: unknown } | null;
}): boolean {
  if (opts.source !== "instagram") return false;
  const mt = String(opts.rawPayload?.mediaType ?? "").toUpperCase();
  if (mt === "REELS" || mt === "VIDEO") return true;
  const tags = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));
  return tags.has("reel") || tags.has("video");
}
