import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EventDetail, FilmDetail } from "@/components/detail/types";
import { apiBaseUrl } from "@/lib/site";

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Collapse whitespace for meta tags (newlines break HTML attributes). */
export function shareDescription(
  raw: string | null | undefined,
  fallback: string,
  max = 160,
): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

export function fetchEventForShare(id: string) {
  return apiGet<EventDetail>(`/v1/events/${id}`);
}

export function fetchMovieForShare(id: string) {
  return apiGet<FilmDetail>(`/v1/movies/${id}`);
}

export async function loadOgFonts() {
  const dir = join(process.cwd(), "src/app/fonts");
  const [fraunces, dmSans, dmSansSemi] = await Promise.all([
    readFile(join(dir, "Fraunces-Bold.ttf")),
    readFile(join(dir, "DMSans-Medium.ttf")),
    readFile(join(dir, "DMSans-SemiBold.ttf")),
  ]);
  return [
    {
      name: "Fraunces",
      data: fraunces,
      style: "normal" as const,
      weight: 700 as const,
    },
    {
      name: "DM Sans",
      data: dmSans,
      style: "normal" as const,
      weight: 500 as const,
    },
    {
      name: "DM Sans",
      data: dmSansSemi,
      style: "normal" as const,
      weight: 600 as const,
    },
  ];
}
