import {
  clearAuthSession,
  getOrCreateAnonymousUserId,
  getSessionToken,
  isUuid,
} from "@/lib/user-id";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000";

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

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
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
