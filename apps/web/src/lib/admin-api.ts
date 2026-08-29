import { API_URL } from "./api";

const TOKEN_KEY = "bored_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY) ||
    null
  );
}

export function setAdminToken(token: string, persist = true) {
  sessionStorage.setItem(TOKEN_KEY, token);
  if (persist) localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `bored_admin_token=${encodeURIComponent(token)}; path=/admin; SameSite=Lax`;
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  document.cookie =
    "bored_admin_token=; path=/admin; Max-Age=0; SameSite=Lax";
}

export async function adminApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error("Not authenticated");

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}/v1/admin${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
