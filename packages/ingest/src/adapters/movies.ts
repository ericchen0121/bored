import { enrichFilm } from "../enrichFilm.js";
import {
  fetchJson,
  type NormalizedShowtimeBatch,
  type SourceAdapter,
} from "../types.js";

type TmsShowing = {
  tmsId?: string;
  title?: string;
  releaseYear?: number;
  runTime?: string;
  shortDescription?: string;
  longDescription?: string;
  ratings?: { code?: string }[];
  genres?: string[];
  preferredImage?: { uri?: string };
  showtimes?: {
    theatre?: { id?: string; name?: string };
    dateTime?: string;
    barg?: boolean;
    ticketURI?: string;
    quals?: string;
  }[];
};

function tmsPosterUrl(uri?: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("http")) return uri;
  const path = uri.replace(/^\//, "");
  const key = process.env.TMS_API_KEY;
  const base = "https://developer.tmsimg.com";
  return key ? `${base}/${path}${path.includes("?") ? "&" : "?"}api_key=${key}` : `${base}/${path}`;
}

export const moviesAdapter: SourceAdapter = {
  id: "movies_tms",
  description: "Gracenote TMS local movie showtimes + Letterboxd/RT enrich",
  async fetch() {
    const tmsKey = process.env.TMS_API_KEY;
    if (!tmsKey) {
      console.warn("[movies_tms] TMS_API_KEY missing — skipping live showtimes");
      return { showtimes: [] };
    }

    const zip = process.env.TMS_ZIP ?? "94107";
    const startDate = new Date().toISOString().slice(0, 10);
    const url = `https://data.tmsapi.com/v1.1/movies/showings?startDate=${startDate}&zip=${zip}&api_key=${tmsKey}&numDays=2`;
    const showings = await fetchJson<TmsShowing[]>(url);
    const batches: NormalizedShowtimeBatch[] = [];

    for (const movie of showings ?? []) {
      if (!movie.title || !movie.showtimes?.length) continue;
      const byTheatre = new Map<string, typeof movie.showtimes>();
      for (const st of movie.showtimes) {
        const tid = st.theatre?.id ?? st.theatre?.name ?? "unknown";
        const list = byTheatre.get(tid) ?? [];
        list.push(st);
        byTheatre.set(tid, list);
      }

      const runtimeMinutes = parseRuntime(movie.runTime);
      const enriched = await enrichFilm(movie.title, movie.releaseYear);
      const posterUrl =
        enriched.posterUrl ?? tmsPosterUrl(movie.preferredImage?.uri);

      for (const [theatreId, sts] of byTheatre) {
        const first = sts[0]!;
        batches.push({
          source: "tms",
          film: {
            title: movie.title,
            year: movie.releaseYear ?? null,
            runtimeMinutes,
            mpaa: movie.ratings?.[0]?.code ?? null,
            synopsis: movie.longDescription ?? movie.shortDescription ?? null,
            tmdbId: enriched.tmdbId,
            imdbId: enriched.imdbId,
            posterUrl,
            backdropUrl: enriched.backdropUrl,
            trailerYoutubeId: enriched.trailerYoutubeId,
            genres: movie.genres?.length
              ? movie.genres
              : enriched.genres ?? [],
            ratings: enriched.ratings,
            letterboxdUrl: enriched.letterboxdUrl,
            rtUrl: enriched.rtUrl,
            rtConsensus: enriched.rtConsensus,
            reviews: enriched.reviews,
          },
          theater: {
            name: first.theatre?.name ?? "Theater",
            sourceTheatreId: theatreId,
            address: null,
            neighborhood: null,
            lat: null,
            lng: null,
          },
          showtimes: sts
            .filter((s) => s.dateTime)
            .map((s) => ({
              startsAt: new Date(s.dateTime!),
              format: s.quals ?? "Standard",
              ticketUrl: s.ticketURI
                ? s.ticketURI.startsWith("http")
                  ? s.ticketURI
                  : `https://www.fandango.com/${s.ticketURI}`
                : null,
              sourceShowtimeId: `${movie.tmsId ?? movie.title}-${theatreId}-${s.dateTime}`,
            })),
        });
      }
    }

    return { showtimes: batches };
  },
};

function parseRuntime(runTime?: string): number | null {
  if (!runTime) return null;
  const m = runTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}
