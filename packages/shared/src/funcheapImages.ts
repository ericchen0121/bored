/**
 * Funcheap / ShortPixel often serve lazy placeholders as empty SVG data-URIs
 * with the real upload in `data-u` (URL-encoded). Listing scrape already unwraps
 * these; detail enrich and API presentation must too.
 */
function decodeSvgDataUri(dataUri: string): string | null {
  try {
    if (dataUri.startsWith("data:image/svg+xml;base64,")) {
      const b64 = dataUri.slice("data:image/svg+xml;base64,".length);
      if (typeof Buffer !== "undefined") {
        return Buffer.from(b64, "base64").toString("utf8");
      }
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (dataUri.startsWith("data:image/svg+xml,")) {
      return decodeURIComponent(dataUri.slice("data:image/svg+xml,".length));
    }
  } catch {
    /* malformed placeholder */
  }
  return null;
}

/** Extract the real image URL from a ShortPixel / Funcheap lazy SVG src. */
export function unwrapFuncheapLazyImageUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("data:image/svg")) return null;
  const svg = decodeSvgDataUri(trimmed);
  if (!svg) return null;
  const dataU = svg.match(/data-u="([^"]+)"/)?.[1];
  if (!dataU) return null;
  try {
    return decodeURIComponent(dataU);
  } catch {
    return dataU;
  }
}

function preferFuncheapCdnUpload(url: string): string {
  const uploadPath = url.match(
    /(?:cdn\.funcheap\.com|sf\.funcheap\.com)(\/wp-content\/uploads\/[^?]+)/i,
  )?.[1];
  return uploadPath ? `https://cdn.funcheap.com${uploadPath}` : url;
}

/**
 * Funcheap listing thumbs are WordPress crops like `photo-175x130.jpeg`.
 * The full upload lives at the same path without the `-WxH` suffix.
 * Only strip small crop sizes so real filenames with dimensions stay intact.
 * Also unwraps ShortPixel SVG lazy placeholders and rejects bare data: URIs.
 */
export function upgradeFuncheapImageUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const unwrapped = unwrapFuncheapLazyImageUrl(trimmed);
  const candidate = (unwrapped ?? trimmed).trim();
  if (!candidate || candidate.startsWith("data:")) return null;

  const withCdn = preferFuncheapCdnUpload(candidate);
  if (!/funcheap\.com/i.test(withCdn)) return withCdn;
  // Strip WordPress crops (`photo-175x130.jpg` → `photo.jpg`). Both lookaheads
  // must share one assertion — `(?=$|\?)` after `(?=\.ext)` never matches
  // because the cursor is still before the extension.
  return withCdn.replace(
    /-(\d+)x(\d+)(?=\.[a-zA-Z0-9]+(?:\?|$))/,
    (match, w, h) => {
      const width = Number(w);
      const height = Number(h);
      if (
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        (width <= 400 || height <= 400)
      ) {
        return "";
      }
      return match;
    },
  );
}
