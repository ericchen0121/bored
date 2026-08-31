const USER_ID_KEY = "bored:userId";
const SESSION_KEY = "bored:session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/** Stable anonymous id for this browser — created on first visit. */
export function getOrCreateAnonymousUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (isUuid(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
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
    localStorage.setItem(USER_ID_KEY, crypto.randomUUID());
  } catch {
    /* ignore */
  }
}
