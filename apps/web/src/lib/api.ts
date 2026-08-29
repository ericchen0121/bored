export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000";

const DEFAULT_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID?.trim() || DEFAULT_DEMO_USER_ID;

function resolveUserId(explicit?: string): string {
  const raw = explicit?.trim() || DEMO_USER_ID;
  return /^[0-9a-f-]{36}$/i.test(raw) ? raw : DEFAULT_DEMO_USER_ID;
}

export async function api<T>(
  path: string,
  init?: RequestInit & { userId?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-User-Id", resolveUserId(init?.userId));

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
