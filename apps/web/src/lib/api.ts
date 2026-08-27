export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID ??
  "00000000-0000-4000-8000-000000000001";

export async function api<T>(
  path: string,
  init?: RequestInit & { userId?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-User-Id", init?.userId ?? DEMO_USER_ID);

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
