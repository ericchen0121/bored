/**
 * Best-effort lineup parse from listing titles like
 * "Artist A, Artist B B2B Artist C" or "Name / Name + Name".
 * Prefer structured `rawPayload.artists` when present.
 */
export function parseLineupArtists(title: string): string[] {
  const cleaned = title
    .replace(/\s+/g, " ")
    .replace(/\s*[:|–—-]\s*.+$/u, "") // drop "Event: …" / "Night — …" tails
    .replace(
      /\b(live|dj set|djset|opening|support|all night|presents?)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(
      /\s*(?:,|\/|\+|&|\bb2b\b|\bw\/\b|\bwith\b|\bft\.?\b|\bfeat\.?\b|\bfeaturing\b)\s*/i,
    )
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && p.length <= 80)
    .filter((p) => !/^(and|the|vs\.?|x)$/i.test(p));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 12) break;
  }

  // Single blob that looks like an event name, not a person — skip
  if (
    out.length === 1 &&
    /\b(festival|party|night|rave|showcase|open mic)\b/i.test(out[0]!)
  ) {
    return [];
  }

  return out;
}
