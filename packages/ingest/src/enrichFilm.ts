import { fetchJson, fetchText } from "./types.js";

export type FilmReview = {
  source: "letterboxd" | "rotten_tomatoes" | "tmdb";
  author?: string | null;
  content: string;
  url?: string | null;
  rating?: number | null;
};

export type FilmEnrichment = {
  tmdbId: number | null;
  imdbId: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerYoutubeId: string | null;
  genres: string[];
  ratings: Record<string, number | null>;
  letterboxdUrl: string | null;
  rtUrl: string | null;
  rtConsensus: string | null;
  reviews: FilmReview[];
};

const BROWSER_UA =
  "Mozilla/5.0 (compatible; BoredSFBot/0.1; +https://github.com/bored)";

/** Per-run cache so TMS multi-theatre batches don't re-scrape the same title. */
const enrichCache = new Map<string, Promise<FilmEnrichment>>();

function cacheKey(title: string, year?: number | null): string {
  return `${title.trim().toLowerCase()}|${year ?? ""}`;
}

function emptyEnrichment(): FilmEnrichment {
  return {
    tmdbId: null,
    imdbId: null,
    posterUrl: null,
    backdropUrl: null,
    trailerYoutubeId: null,
    genres: [],
    ratings: {},
    letterboxdUrl: null,
    rtUrl: null,
    rtConsensus: null,
    reviews: [],
  };
}

function slugify(title: string, sep: "-" | "_"): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']s\b/g, "s")
    .replace(/['']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");
}

/** Strip venue marketing suffixes so slugs match Letterboxd/RT catalog titles. */
function catalogTitle(title: string): string {
  let t = title
    .replace(/\([^)]*(?:restoration|director'?s\s+cut|4k|remaster)[^)]*\)/gi, "")
    .replace(/\b(?:\d+k\s+)?restoration\b/gi, "")
    .replace(/\bdirector'?s\s+cut\b/gi, "")
    .replace(/\bfirst\s+looks?\b.*$/gi, "")
    .replace(/^.*?\bpresents?\s*[:\-–]\s*/i, "")
    .replace(/\s*:\s*(?:the\s+)?$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // "Gypsy 83: The" after director's-cut strip → drop dangling colon clause
  t = t.replace(/\s*:\s*the\s*$/i, "").trim();
  return t;
}

function letterboxdSlugCandidates(title: string, year?: number | null): string[] {
  const base = slugify(title, "-");
  if (!base) return [];
  const noArticle = base.replace(/^(the|a|an)-/, "");
  // "luchino-viscontis-white-nights" → also try last 2–4 tokens (core title)
  const parts = base.split("-").filter(Boolean);
  const tail =
    parts.length > 3 ? parts.slice(-2).join("-") : null;
  const tail3 =
    parts.length > 4 ? parts.slice(-3).join("-") : null;

  const roots = [...new Set([base, noArticle, tail, tail3].filter(Boolean))] as string[];
  const out: string[] = [];
  for (const root of roots) {
    if (year) out.push(`${root}-${year}`);
    out.push(root);
    if (year) out.push(`${root}-${year - 1}`);
  }
  return out;
}

function extractYoutubeId(html: string): string | null {
  const patterns = [
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractImdbId(html: string): string | null {
  const m = html.match(/imdb\.com\/title\/(tt\d+)/i);
  return m?.[1] ?? null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const html = await fetchText(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    } as RequestInit);
    if (/Just a moment|cf-challenge|Enable JavaScript and cookies/i.test(html.slice(0, 800))) {
      return null;
    }
    return html;
  } catch (err) {
    const msg = (err as Error).message ?? "";
    // Expected for speculative slug guesses — keep logs quiet.
    if (!/\bfailed: 404\b/.test(msg)) {
      console.warn("[enrichFilm] fetch failed", url, msg);
    }
    return null;
  }
}

async function youtubeSearchTrailer(
  title: string,
  year?: number | null,
): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const q = [title, year ? String(year) : null, "official trailer"]
      .filter(Boolean)
      .join(" ");
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      maxResults: "1",
      q,
      key,
    });
    const data = await fetchJson<{
      items?: { id?: { videoId?: string } }[];
    }>(`https://www.googleapis.com/youtube/v3/search?${params}`);
    return data.items?.[0]?.id?.videoId ?? null;
  } catch (err) {
    console.warn("[youtube] trailer search failed", err);
    return null;
  }
}

type LetterboxdHit = {
  url: string | null;
  rating: number | null;
  posterUrl: string | null;
  imdbId: string | null;
  trailerYoutubeId: string | null;
  genres: string[];
  reviews: FilmReview[];
};

async function enrichLetterboxd(
  title: string,
  year?: number | null,
): Promise<LetterboxdHit> {
  const empty: LetterboxdHit = {
    url: null,
    rating: null,
    posterUrl: null,
    imdbId: null,
    trailerYoutubeId: null,
    genres: [],
    reviews: [],
  };

  const slugs = letterboxdSlugCandidates(title, year);
  if (!slugs.length) return empty;

  const candidates = slugs.map((s) => `https://letterboxd.com/film/${s}/`);

  let html: string | null = null;
  let filmUrl: string | null = null;
  for (const url of candidates) {
    const page = await fetchHtml(url);
    if (!page) continue;
    const ogUrl = page.match(
      /property="og:url"\s+content="(https:\/\/letterboxd\.com\/film\/[^"]+)"/i,
    )?.[1];
    const ogTitle = page.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
    // Reject soft-404 / wrong title pages.
    if (!ogUrl || /not found/i.test(page.slice(0, 2000))) continue;
    // For shortened tail slugs, require the candidate title to appear in og:title.
    if (ogTitle && !titleMatches(title, ogTitle, year)) {
      // Allow match against the core title when director/prefix was stripped for slug.
      const core = title.split(/\s+/).slice(-3).join(" ");
      if (!titleMatches(core, ogTitle, year) && !titleMatches(catalogTitle(title), ogTitle, year)) {
        continue;
      }
    }
    html = page;
    filmUrl = ogUrl;
    break;
  }

  if (!html || !filmUrl) return empty;

  let rating: number | null = null;
  const genres: string[] = [];
  const ldBlocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const m of ldBlocks) {
    try {
      const json = JSON.parse(m[1]!) as {
        "@type"?: string;
        genre?: string | string[];
        aggregateRating?: { ratingValue?: string | number };
        "@graph"?: {
          "@type"?: string;
          genre?: string | string[];
          aggregateRating?: { ratingValue?: string | number };
        }[];
      };
      const nodes =
        json["@graph"]?.length ?
          json["@graph"]
        : json["@type"] ? [json]
        : [];
      for (const node of nodes) {
        const g = node.genre;
        if (Array.isArray(g)) genres.push(...g.map(String));
        else if (typeof g === "string") genres.push(g);
      }
      const value =
        json.aggregateRating?.ratingValue ??
        json["@graph"]?.find((n) => n.aggregateRating)?.aggregateRating
          ?.ratingValue;
      if (value != null) {
        const n = Number(value);
        if (Number.isFinite(n)) rating = Math.round(n * 100) / 100;
      }
    } catch {
      /* ignore */
    }
  }
  if (rating == null) {
    const meta = html.match(/"ratingValue"\s*:\s*"?([0-9.]+)"?/i);
    if (meta?.[1]) {
      const n = Number(meta[1]);
      if (Number.isFinite(n) && n <= 5) rating = Math.round(n * 100) / 100;
    }
  }

  const ogImage = html.match(
    /property="og:image"\s+content="(https:\/\/[^"]+)"/i,
  )?.[1];
  const filmPoster = html.match(
    /(https:\/\/a\.ltrbxd\.com\/resized\/film-poster\/[^"\s]+\.jpg)/i,
  )?.[1];

  const reviews: FilmReview[] = [];
  const reviewBlocks = [
    ...html.matchAll(
      /class=["'][^"']*body-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ];
  for (const block of reviewBlocks.slice(0, 4)) {
    const text = block[1]!
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 40) continue;
    reviews.push({
      source: "letterboxd",
      content: text.slice(0, 420),
      url: filmUrl,
    });
    if (reviews.length >= 2) break;
  }

  return {
    url: filmUrl,
    rating,
    posterUrl: filmPoster ?? ogImage ?? null,
    imdbId: extractImdbId(html),
    trailerYoutubeId: extractYoutubeId(html),
    genres: [...new Set(genres)],
    reviews,
  };
}

type RtSearchHit = {
  path: string;
  name: string;
  releaseYear: number | null;
};

function parseRtSearchHits(html: string): RtSearchHit[] {
  const hits: RtSearchHit[] = [];
  for (const row of html.matchAll(
    /<search-page-media-row([\s\S]*?)<\/search-page-media-row>/gi,
  )) {
    const block = row[0]!;
    const path = block.match(
      /href="(?:https?:\/\/www\.rottentomatoes\.com)?(\/m\/[a-z0-9_-]+)"/i,
    )?.[1];
    const name = block
      .match(/data-qa="info-name"[^>]*>\s*([^<]+?)\s*</i)?.[1]
      ?.replace(/&#39;/g, "'")
      .trim();
    const releaseYear = block.match(/release-year="(\d{4})"/)?.[1];
    if (!path || !name) continue;
    hits.push({
      path,
      name,
      releaseYear: releaseYear ? Number(releaseYear) : null,
    });
  }
  return hits;
}

type RtHit = {
  url: string | null;
  rtCritics: number | null;
  rtAudience: number | null;
  consensus: string | null;
  posterUrl: string | null;
  genres: string[];
  imdbId: string | null;
  trailerYoutubeId: string | null;
};

async function enrichRottenTomatoes(
  title: string,
  year?: number | null,
): Promise<RtHit> {
  const empty: RtHit = {
    url: null,
    rtCritics: null,
    rtAudience: null,
    consensus: null,
    posterUrl: null,
    genres: [],
    imdbId: null,
    trailerYoutubeId: null,
  };

  const under = slugify(title, "_");
  const hyphen = slugify(title, "-");
  if (!under && !hyphen) return empty;

  const candidates = [
    year && under ? `https://www.rottentomatoes.com/m/${under}_${year}` : null,
    year && hyphen ? `https://www.rottentomatoes.com/m/${hyphen}_${year}` : null,
    under ? `https://www.rottentomatoes.com/m/${under}` : null,
    hyphen && hyphen !== under
      ? `https://www.rottentomatoes.com/m/${hyphen}`
      : null,
    year && under
      ? `https://www.rottentomatoes.com/m/${under}_${year - 1}`
      : null,
  ].filter((u): u is string => Boolean(u));

  let filmUrl: string | null = null;
  let html: string | null = null;

  for (const url of candidates) {
    const page = await fetchHtml(url);
    if (!page || !/id="media-scorecard-json"|@type":"Movie"/i.test(page)) {
      continue;
    }
    const ogTitle = page.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
    if (ogTitle && !titleMatches(title, ogTitle, year)) continue;
    html = page;
    filmUrl = url;
    break;
  }

  if (!html) {
    const q = encodeURIComponent(year ? `${title} ${year}` : title);
    const searchHtml = await fetchHtml(
      `https://www.rottentomatoes.com/search?search=${q}`,
    );
    if (searchHtml) {
      const paired = parseRtSearchHits(searchHtml);

      const preferred =
        (year != null ?
          paired.find(
            (p) =>
              titleMatches(title, p.name, year) &&
              (p.releaseYear == null || p.releaseYear === year),
          )
        : null) ??
        paired.find((p) => titleMatches(title, p.name, year)) ??
        paired.find((p) => titleMatches(title, p.name, null));

      if (preferred) {
        const url = `https://www.rottentomatoes.com${preferred.path}`;
        const page = await fetchHtml(url);
        if (page) {
          html = page;
          filmUrl = url;
        }
      }
    }
  }

  if (!html || !filmUrl) return empty;

  let rtCritics: number | null = null;
  let rtAudience: number | null = null;
  const scorecard = html.match(
    /<script[^>]*id=["']media-scorecard-json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (scorecard?.[1]) {
    try {
      const data = JSON.parse(scorecard[1].trim()) as {
        criticsScore?: { score?: string | number };
        audienceScore?: { score?: string | number };
      };
      const c = Number(data.criticsScore?.score);
      const a = Number(data.audienceScore?.score);
      if (Number.isFinite(c)) rtCritics = c;
      if (Number.isFinite(a)) rtAudience = a;
    } catch {
      /* ignore */
    }
  }

  const genres: string[] = [];
  const ldBlocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const m of ldBlocks) {
    try {
      const json = JSON.parse(m[1]!) as {
        "@type"?: string;
        genre?: string | string[];
        aggregateRating?: { ratingValue?: string | number };
      };
      if (json["@type"] !== "Movie") continue;
      const g = json.genre;
      if (Array.isArray(g)) genres.push(...g.map(String));
      else if (typeof g === "string") genres.push(g);
      if (rtCritics == null && json.aggregateRating?.ratingValue != null) {
        const n = Number(json.aggregateRating.ratingValue);
        if (Number.isFinite(n)) rtCritics = n;
      }
    } catch {
      /* ignore */
    }
  }

  let consensus: string | null = null;
  const consensusMatch = html.match(
    /Critics Consensus[\s\S]{0,80}?<\/[^>]+>\s*<[^>]+>([^<]{40,500})/i,
  );
  if (consensusMatch?.[1]) {
    consensus = consensusMatch[1].replace(/\s+/g, " ").trim();
  }

  const ogImage = html.match(
    /property="og:image"\s+content="(https:\/\/[^"]+)"/i,
  )?.[1];

  return {
    url: filmUrl,
    rtCritics,
    rtAudience,
    consensus,
    posterUrl: ogImage ?? null,
    genres: [...new Set(genres)],
    imdbId: extractImdbId(html),
    trailerYoutubeId: extractYoutubeId(html),
  };
}

function titleMatches(
  expected: string,
  candidate: string,
  year?: number | null,
): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(\d{4}\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const a = norm(expected);
  const b = norm(candidate);
  if (!a || !b) return false;
  if (a === b || b.startsWith(a) || a.startsWith(b)) return true;
  // Allow year mismatch only when titles align closely.
  if (year && candidate.includes(String(year))) {
    return b.includes(a) || a.includes(b);
  }
  return false;
}

async function softImdbRating(imdbId: string): Promise<number | null> {
  const html = await fetchHtml(`https://www.imdb.com/title/${imdbId}/`);
  if (!html) return null;
  const patterns = [
    /"ratingValue"\s*:\s*"?([0-9.]+)"?/,
    /aggregateRating[^}]*"ratingValue"\s*:\s*"?([0-9.]+)"?/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 10) {
      return Math.round(n * 10) / 10;
    }
  }
  return null;
}

/** Letterboxd + Rotten Tomatoes scrape (+ optional YouTube trailer search). */
export async function enrichFilm(
  title: string,
  year?: number | null,
): Promise<FilmEnrichment> {
  const key = cacheKey(title, year);
  const cached = enrichCache.get(key);
  if (cached) return cached;

  const promise = enrichFilmUncached(title, year);
  enrichCache.set(key, promise);
  return promise;
}

async function enrichFilmUncached(
  title: string,
  year?: number | null,
): Promise<FilmEnrichment> {
  const result = emptyEnrichment();
  const queryTitle = catalogTitle(title) || title;
  // Series / venue programs are not catalog films — keep venue poster only.
  if (
    queryTitle.length < 3 ||
    /^(roxie|alamo|theater|theatre)\b/i.test(queryTitle) ||
    /#\d+/.test(title)
  ) {
    return result;
  }

  const [lb, rt] = await Promise.all([
    enrichLetterboxd(queryTitle, year),
    enrichRottenTomatoes(queryTitle, year),
  ]);

  if (lb.url) result.letterboxdUrl = lb.url;
  if (lb.rating != null) result.ratings.letterboxd = lb.rating;
  if (lb.posterUrl) result.posterUrl = lb.posterUrl;
  if (lb.imdbId) result.imdbId = lb.imdbId;
  if (lb.trailerYoutubeId) result.trailerYoutubeId = lb.trailerYoutubeId;
  if (lb.reviews.length) result.reviews.push(...lb.reviews);

  if (rt.url) result.rtUrl = rt.url;
  if (rt.rtCritics != null) result.ratings.rtCritics = rt.rtCritics;
  if (rt.rtAudience != null) result.ratings.rtAudience = rt.rtAudience;
  if (rt.consensus) {
    result.rtConsensus = rt.consensus;
    result.reviews.unshift({
      source: "rotten_tomatoes",
      author: "Critics Consensus",
      content: rt.consensus,
      url: rt.url,
    });
  }
  if (!result.posterUrl && rt.posterUrl) result.posterUrl = rt.posterUrl;
  if (!result.imdbId && rt.imdbId) result.imdbId = rt.imdbId;
  if (!result.trailerYoutubeId && rt.trailerYoutubeId) {
    result.trailerYoutubeId = rt.trailerYoutubeId;
  }

  const mergedGenres = [...new Set([...lb.genres, ...rt.genres])];
  if (mergedGenres.length) result.genres = mergedGenres;

  if (result.imdbId) {
    const imdb = await softImdbRating(result.imdbId);
    if (imdb != null) result.ratings.imdb = imdb;
  }

  if (!result.trailerYoutubeId) {
    result.trailerYoutubeId = await youtubeSearchTrailer(queryTitle, year);
  }

  result.reviews = result.reviews.slice(0, 5);
  return result;
}
