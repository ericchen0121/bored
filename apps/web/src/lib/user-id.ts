const USER_ID_KEY = "bored:userId";
const SESSION_KEY = "bored:session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * UUID for anon ids. Prefer crypto.randomUUID; fall back when unavailable
 * (Safari treats http://LAN-IP as a non-secure context, so randomUUID is missing).
 */
function newUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  if (typeof c?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === "x" ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable anonymous id for this browser — created on first visit. */
export function getOrCreateAnonymousUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (isUuid(existing)) return existing;
    const id = newUuid();
    localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return newUuid();
  }
}

export function readStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(USER_ID_KEY);
    return isUuid(id) ? id : null;
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(SESSION_KEY);
    return token?.trim() || null;
  } catch {
    return null;
  }
}

export function persistAuthSession(sessionToken: string, userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, sessionToken);
    localStorage.setItem(USER_ID_KEY, userId);
  } catch {
    /* private mode */
  }
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** After sign-out: drop session and mint a fresh anonymous browser id. */
export function resetToAnonymousIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(USER_ID_KEY, newUuid());
  } catch {
    /* ignore */
  }
}
