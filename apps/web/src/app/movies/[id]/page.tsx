"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FeedBackLink } from "@/components/FeedBackLink";
import { MovieDetailContent } from "@/components/detail/MovieDetailContent";
import type { FilmDetail } from "@/components/detail/types";

export default function MovieDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<FilmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<FilmDetail>(`/v1/movies/${params.id}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [params.id]);

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
