"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { trackDetailOpened } from "@/lib/analytics";
import { FeedBackLink } from "@/components/FeedBackLink";
import { MovieDetailContent } from "@/components/detail/MovieDetailContent";
import type { FilmDetail } from "@/components/detail/types";

export function MovieDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<FilmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<FilmDetail>(`/v1/movies/${id}`)
      .then((film) => {
        setData(film);
        trackDetailOpened({
          kind: "movie",
          id,
          surface: "standalone",
        });
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="topbar">
        <FeedBackLink />
      </div>
      <MovieDetailContent data={data} />
    </>
  );
}
