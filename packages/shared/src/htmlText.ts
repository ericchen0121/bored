function codePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/**
 * Decode common HTML entities (named + numeric) for plain-text fields.
 * Runs a few passes so sequences like `&amp;#8217;` fully resolve.
 */
export function decodeHtmlEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&#(\d+);/g, (m, n) => codePoint(Number(n), m))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(parseInt(n, 16), m))
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Strip tags and decode entities into collapsed plain text. */
export function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
