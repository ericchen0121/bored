import { partifulDetailImageUrl, partifulImageFromPayload } from "./partifulImage";
import { upgradeFuncheapImageUrl } from "./funcheapImages";

/** Height/width at or above this → square/portrait flyer (show full image). */
export const FLYER_ASPECT_RATIO_MIN = 0.95;

export function isFlyerAspectRatio(ratio: number | null | undefined): boolean {
  return ratio != null && Number.isFinite(ratio) && ratio >= FLYER_ASPECT_RATIO_MIN;
}

export function aspectRatioFromEventPayload(
  rawPayload: unknown,
  source?: string | null,
): number | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const payload = rawPayload as Record<string, unknown>;

  if (source === "partiful") {
    const image = partifulImageFromPayload(rawPayload);
    const w = image?.width;
    const h = image?.height;
    if (w && h && w > 0) return h / w;
  }

  const w = payload.imageWidth ?? payload.image_width;
  const h = payload.imageHeight ?? payload.image_height;
  if (typeof w === "number" && typeof h === "number" && w > 0) {
    return h / w;
  }

  const image = payload.image;
  if (image && typeof image === "object") {
    const iw = (image as { width?: number }).width;
    const ih = (image as { height?: number }).height;
    if (iw && ih && iw > 0) return ih / iw;
  }

  return null;
}

/** Best-effort full-size hero URL for event detail (feed thumbs may stay cropped). */
export function eventDetailImageUrl(opts: {
  source?: string | null;
  imageUrl?: string | null;
  rawPayload?: unknown;
}): string | null {
  const { source, imageUrl, rawPayload } = opts;
  if (!imageUrl?.trim()) return null;

  if (source === "partiful") {
    return (
      partifulDetailImageUrl(partifulImageFromPayload(rawPayload)) ?? imageUrl
    );
  }

  if (source === "funcheap") {
    return upgradeFuncheapImageUrl(imageUrl);
  }

  return imageUrl;
}

export function eventHeroImageFit(opts: {
  source?: string | null;
  rawPayload?: unknown;
}): "cover" | "contain" | null {
  const ratio = aspectRatioFromEventPayload(opts.rawPayload, opts.source);
  if (ratio != null) {
    return isFlyerAspectRatio(ratio) ? "contain" : "cover";
  }
  // RA listings are flyer art; we don't store width/height at ingest.
  if (opts.source === "ra") return "contain";
  return null;
}
