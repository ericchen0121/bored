"use client";

import type { FilmDetail, FilmReview } from "./types";
import {
  FilmRatingBadges,
  ImdbLogo,
  LetterboxdLogo,
  RottenTomatoesLogo,
} from "@/components/FilmRatingBadges";
import { EventWeatherInline } from "@/components/detail/EventWeatherInline";
import { showtimeOutboundHref } from "@/lib/outbound";
import { trackCtaClicked } from "@/lib/analytics";
import { SaveButton } from "@/components/SaveButton";
import { usePathname } from "next/navigation";

const FILM_TZ = "America/Los_Angeles";
/** Typical feature length used for weather window when runtime is unknown. */
const DEFAULT_RUNTIME_MS = 2.5 * 60 * 60 * 1000;

function reviewSourceMeta(r: FilmReview): string {
  const parts: string[] = [];
  if (r.source === "tmdb") parts.push("TMDB");
  if (r.author) parts.push(r.author);
  if (r.rating != null) parts.push(String(r.rating));
  return parts.join(" · ");
}

function theaterMapsQuery(theater: FilmDetail["showtimes"][number]["theater"]): string | null {
  if (theater.lat != null && theater.lng != null) {
    return `${theater.lat},${theater.lng}`;
  }
  const parts = [theater.name?.trim(), theater.address?.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function MovieDetailContent({
  data,
  compact = false,
}: {
  data: FilmDetail;
  compact?: boolean;
}) {
  const { film, showtimes } = data;
  const reviews = film.reviews ?? [];
  const pathname = usePathname();

  return (
    <div className={`detail-body ${compact ? "is-compact" : ""}`}>
      <header className="detail-body__header detail-body__header--film">
        {film.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={film.posterUrl}
            alt=""
            className="detail-body__poster"
          />
        ) : (
          <div className="poster placeholder detail-body__poster" aria-hidden>
            Poster
          </div>
        )}
        <div>
          <div className="detail-body__header-top">
            <p className="eyebrow">In theaters</p>
            <SaveButton
              targetKind="film"
              targetId={film.id}
              returnTo={pathname || undefined}
              className="detail-body__save"
            />
          </div>
          <h2 className="detail-body__title">
            {film.title}
            {film.year ? ` (${film.year})` : ""}
          </h2>
          {film.genres.length > 0 && (
            <div className="tags detail-body__genres">
              {film.genres.map((g) => (
                <span key={g} className="badge genre">
                  {g}
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <FilmRatingBadges ratings={film.ratings} showAudience />
          </div>
          <div className="detail-body__links">
            {film.imdbId && (
              <a
                className="btn btn--logo-link"
                href={`https://www.imdb.com/title/${film.imdbId}`}
                target="_blank"
                rel="noreferrer"
                aria-label="IMDb"
                title="IMDb"
              >
                <ImdbLogo size="lg" />
              </a>
            )}
            {film.letterboxdUrl && (
              <a
                className="btn btn--logo-link"
                href={film.letterboxdUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Letterboxd"
                title="Letterboxd"
              >
                <LetterboxdLogo size="lg" />
              </a>
            )}
            {film.rtUrl && (
              <a
                className="btn btn--logo-link"
                href={film.rtUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Rotten Tomatoes"
                title="Rotten Tomatoes"
              >
                <RottenTomatoesLogo
                  size="lg"
                  fresh={(film.ratings?.rtCritics ?? 100) >= 60}
                />
              </a>
            )}
          </div>
        </div>
      </header>

      {film.trailerYoutubeId && (
        <section className="detail-body__trailer" aria-label="Trailer">
          <div className="detail-body__trailer-frame">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${film.trailerYoutubeId}?rel=0`}
              title={`${film.title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </section>
      )}

      {film.synopsis && (
        <p className="lede detail-body__synopsis">{film.synopsis}</p>
      )}

      {(film.rtConsensus || reviews.length > 0) && (
        <section className="detail-body__reviews" aria-label="Reviews">
          <h3 className="section-title detail-body__showtimes-title">
            Reviews
          </h3>
          {film.rtConsensus && (
            <blockquote className="detail-body__review detail-body__review--consensus">
              <p className="detail-body__review-source detail-body__review-source--logo">
                <RottenTomatoesLogo
                  size="md"
                  fresh={(film.ratings?.rtCritics ?? 100) >= 60}
                />
              </p>
              <p className="detail-body__review-text">{film.rtConsensus}</p>
              {film.rtUrl && (
                <a
                  className="detail-body__review-link"
                  href={film.rtUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Full review
                </a>
              )}
            </blockquote>
          )}
          {reviews
            .filter(
              (r) =>
                !(
                  r.source === "rotten_tomatoes" &&
                  film.rtConsensus &&
                  r.content === film.rtConsensus
                ),
            )
            .map((r, i) => {
              const meta = reviewSourceMeta(r);
              return (
                <blockquote
                  key={`${r.source}-${i}`}
                  className="detail-body__review"
                >
                  <p className="detail-body__review-source detail-body__review-source--logo">
                    {r.source === "letterboxd" ? (
                      <LetterboxdLogo size="md" />
                    ) : r.source === "rotten_tomatoes" ? (
                      <RottenTomatoesLogo
                        size="md"
                        fresh={(film.ratings?.rtCritics ?? 100) >= 60}
                      />
                    ) : null}
                    {meta}
                  </p>
                  <p className="detail-body__review-text">{r.content}</p>
                  {r.url && (
                    <a
                      className="detail-body__review-link"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Full review
                    </a>
                  )}
                </blockquote>
              );
            })}
        </section>
      )}

      <h3 className="section-title detail-body__showtimes-title">
        Showtimes today
      </h3>
      {showtimes.length === 0 && (
        <p className="muted">
          No showtimes in window — check back after TMS ingest.
        </p>
      )}
      {showtimes.map((s) => {
        const mapsQuery = theaterMapsQuery(s.theater);
        const mapsEmbed = mapsQuery
          ? `https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery)}&z=15&output=embed`
          : null;
        const mapsLink = mapsQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
          : null;
        const endsAt = new Date(
          new Date(s.startsAt).getTime() + DEFAULT_RUNTIME_MS,
        ).toISOString();

        return (
          <div key={s.id} className="panel detail-body__showtime">
            <strong>{s.theater.name}</strong>
            <div className="meta">
              {[s.theater.neighborhood, s.format].filter(Boolean).join(" · ")}
            </div>
            <div className="times">
              <span className="time">
                {new Date(s.startsAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: FILM_TZ,
                })}
              </span>
            </div>

            <EventWeatherInline
              startsAt={s.startsAt}
              endsAt={endsAt}
              timezone={FILM_TZ}
              lat={s.theater.lat}
              lng={s.theater.lng}
              venueName={s.theater.name}
              address={s.theater.address}
              neighborhood={s.theater.neighborhood}
              city="sf"
              placeLabel={s.theater.neighborhood || s.theater.name}
            />

            {(s.theater.address ||
              s.theater.neighborhood ||
              (s.theater.lat != null && s.theater.lng != null)) && (
              <div className="detail-body__location" style={{ marginTop: 12 }}>
                {s.theater.address ? (
                  <span className="meta detail-body__address">
                    {s.theater.address}
                  </span>
                ) : s.theater.neighborhood ? (
                  <span className="badge neighborhood">
                    {s.theater.neighborhood}
                  </span>
                ) : null}
                {mapsEmbed ? (
                  <div className="detail-body__map-frame">
                    <iframe
                      src={mapsEmbed}
                      title={`Map of ${s.theater.name}`}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                ) : null}
                {mapsLink ? (
                  <a
                    className="detail-body__map-link"
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </div>
            )}

            {s.ticketUrl && (
              <p style={{ marginTop: 10 }}>
                <a
                  className="btn primary"
                  href={showtimeOutboundHref(s.id)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackCtaClicked({
                      kind: "showtime",
                      id: s.id,
                      slot: "tickets",
                    })
                  }
                >
                  Tickets
                </a>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
