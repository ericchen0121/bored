export type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string | null;
  /** `event` or `recommendation` (evergreen tip) */
  kind?: string | null;
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  categories: string[];
  tags?: string[];
  url: string | null;
  imageUrl: string | null;
  source: string;
  organizer?: string | null;
  ageRestriction?: string | null;
  registrationStatus?: string | null;
  isSponsored?: boolean | null;
  sponsorEndsAt?: string | null;
  rawPayload?: {
    author?: string | null;
    authorAvatarUrl?: string | null;
    published?: string | null;
    outlet?: string | null;
    artists?: string[] | null;
    genres?: string[] | null;
    promoters?: string[] | null;
    [key: string]: unknown;
  } | null;
};

export type FilmReview = {
  source: "letterboxd" | "rotten_tomatoes" | "tmdb";
  author?: string | null;
  content: string;
  url?: string | null;
  rating?: number | null;
};

export type FilmDetail = {
  film: {
    id: string;
    title: string;
    year: number | null;
    synopsis: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    trailerYoutubeId: string | null;
    ratings: {
      imdb?: number | null;
      rtCritics?: number | null;
      rtAudience?: number | null;
      letterboxd?: number | null;
      metacritic?: number | null;
    };
    letterboxdUrl: string | null;
    rtUrl: string | null;
    rtConsensus: string | null;
    reviews?: FilmReview[];
    imdbId: string | null;
    genres: string[];
  };
  showtimes: {
    id: string;
    startsAt: string;
    format: string | null;
    ticketUrl: string | null;
    theater: {
      name: string;
      neighborhood: string | null;
      address: string | null;
      lat?: number | null;
      lng?: number | null;
    };
  }[];
};

export type DetailSelection =
  | { kind: "event"; id: string }
  | { kind: "movie"; id: string };
