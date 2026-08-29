import type { Metadata } from "next";
import { MovieDetailClient } from "./MovieDetailClient";
import { fetchMovieForShare, shareDescription } from "@/lib/og-assets";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchMovieForShare(id);
  const film = data?.film;
  if (!film) {
    return { title: "Movie — Bored" };
  }

  const fallback =
    [film.year, film.genres?.slice(0, 2).join(", ")].filter(Boolean).join(" · ") ||
    "Now playing nearby";
  const description = shareDescription(film.synopsis, fallback);

  return {
    title: `${film.title} — Bored`,
    description,
    openGraph: {
      title: film.title,
      description,
      type: "website",
      siteName: "Bored",
    },
    twitter: {
      card: "summary_large_image",
      title: film.title,
      description,
    },
  };
}

export default async function MovieDetailPage({ params }: Props) {
  const { id } = await params;
  return <MovieDetailClient id={id} />;
}
