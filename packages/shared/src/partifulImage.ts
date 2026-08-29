export type PartifulImagePayload = {
  source?: string;
  type?: string;
  url?: string;
  width?: number;
  height?: number;
  upload?: { path?: string; url?: string };
  gif?: {
    images?: {
      original?: { url?: string };
      fixed_width?: { url?: string };
    };
  };
};

export function partifulImageFromPayload(
  rawPayload: unknown,
): PartifulImagePayload | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const image = (rawPayload as { image?: PartifulImagePayload }).image;
  return image && typeof image === "object" ? image : null;
}

export function partifulImageAspectRatio(
  image: PartifulImagePayload | null | undefined,
): number | null {
  const w = image?.width;
  const h = image?.height;
  if (!w || !h || w <= 0) return null;
  return h / w;
}

/**
 * Partiful cover art is often a portrait or square flyer (text-heavy).
 * Landscape uploads are usually photos — keep the cropped hero treatment.
 */
export function isPartifulPosterLikeImage(
  image: PartifulImagePayload | null | undefined,
): boolean {
  if (!image) return false;
  if (image.source === "partiful_posters") return true;
  const ratio = partifulImageAspectRatio(image);
  return ratio != null && ratio >= 0.95;
}

/** Square crop for feed cards. */
export function partifulFeedImageUrl(
  image: PartifulImagePayload | null | undefined,
): string | null {
  if (!image) return null;
  const path = image.upload?.path?.replace(/^\//, "");
  if (path) {
    return `https://partiful.imgix.net/${path}?w=400&h=400&fit=crop&auto=format`;
  }
  const raw =
    image.url ||
    image.upload?.url ||
    image.gif?.images?.fixed_width?.url ||
    image.gif?.images?.original?.url ||
    null;
  return raw || null;
}

/** Full-aspect detail image — preserves flyer text. */
export function partifulDetailImageUrl(
  image: PartifulImagePayload | null | undefined,
): string | null {
  if (!image) return null;
  const path = image.upload?.path?.replace(/^\//, "");
  if (path) {
    return `https://partiful.imgix.net/${path}?w=900&auto=format`;
  }
  return (
    image.url ||
    image.upload?.url ||
    image.gif?.images?.original?.url ||
    image.gif?.images?.fixed_width?.url ||
    null
  );
}

export type PartifulImageDisplay = {
  isPosterLike: boolean;
  detailUrl: string | null;
  aspectRatio: number | null;
};

export function partifulImageDisplay(
  rawPayload: unknown,
  fallbackImageUrl?: string | null,
): PartifulImageDisplay {
  const image = partifulImageFromPayload(rawPayload);
  return {
    isPosterLike: isPartifulPosterLikeImage(image),
    detailUrl: partifulDetailImageUrl(image) ?? fallbackImageUrl ?? null,
    aspectRatio: partifulImageAspectRatio(image),
  };
}
