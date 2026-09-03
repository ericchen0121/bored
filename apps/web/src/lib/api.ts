import {
  clearAuthSession,
  getOrCreateAnonymousUserId,
  getSessionToken,
  isUuid,
} from "@/lib/user-id";
import { feedVideoPosterUrl } from "@bored/shared";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000";

/** API proxy for Instagram video (CDN CORP blocks browser <video>). */
export function instagramMediaStreamUrl(eventId: string): string {
  return `${API_URL}/v1/events/${eventId}/media/stream`;
}

/** API proxy for Instagram poster (CDN CORP blocks browser <img>). */
export function instagramMediaPosterUrl(eventId: string): string {
  return `${API_URL}/v1/events/${eventId}/media/poster`;
}

/** Poster URL safe for browser <img> — Instagram always via API proxy. */
export function feedCardPosterUrl(card: {
  id: string;
  source?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  rawPayload?: { videoId?: unknown } | null;
}): string | null {
  if (card.source === "instagram") return instagramMediaPosterUrl(card.id);
  return feedVideoPosterUrl(card);
}

export type ApiInit = RequestInit & {
  userId?: string;
  /** Skip attaching stored session (e.g. verify before session is saved). */
  skipSession?: boolean;
};

function resolveUserId(explicit?: string): string {
  const raw = explicit?.trim() || getOrCreateAnonymousUserId();
  return isUuid(raw) ? raw : getOrCreateAnonymousUserId();
}

export async function api<T>(path: string, init?: ApiInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-User-Id", resolveUserId(init?.userId));

  if (!init?.skipSession) {
    const session = getSessionToken();
    if (session) headers.set("Authorization", `Bearer ${session}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new Error(`API unreachable (${API_URL}${path}): ${msg}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiLogout(): Promise<void> {
  const session = getSessionToken();
  if (session) {
    try {
      await api("/v1/auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
  }
  clearAuthSession();
}

/** Fire-and-forget engagement signal (impressed / opened / saved / …). */
export function recordFeedSignal(input: {
  targetKind: "event" | "film" | "showtime";
  targetId: string;
  type: "saved" | "dismissed" | "going" | "opened" | "impressed";
}): void {
  void api("/v1/me/signals", {
    method: "POST",
    body: JSON.stringify(input),
  }).catch(() => {
    /* ignore — ranking soft-hides are best-effort */
  });
}
