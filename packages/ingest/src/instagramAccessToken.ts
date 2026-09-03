/**
 * Instagram / Meta long-lived user token lifecycle.
 *
 * Bootstrap from `IG_ACCESS_TOKEN`. Renewed tokens are stored in `app_settings`
 * so API + ingest share them without editing Railway env on every refresh.
 * Requires `META_APP_ID` + `META_APP_SECRET` for debug_token + exchange.
 */
import { appSettings, db } from "@bored/db";
import { eq } from "drizzle-orm";

export const IG_TOKEN_SETTING_KEY = "ig_access_token";

const GRAPH = "https://graph.facebook.com/v21.0";
/** Auto-renew when fewer than this many days remain. */
export const IG_TOKEN_RENEW_WITHIN_DAYS = 14;

export type IgTokenStatus = {
  configured: boolean;
  source: "db" | "env" | null;
  metaAppConfigured: boolean;
  businessUserIdConfigured: boolean;
  valid: boolean | null;
  expiresAt: string | null;
  expiresInDays: number | null;
  dataAccessExpiresAt: string | null;
  scopes: string[];
  error: string | null;
  canRenew: boolean;
  shouldRenew: boolean;
  tokenUpdatedAt: string | null;
};

function metaAppId(): string | null {
  return process.env.META_APP_ID?.trim() || null;
}

function metaAppSecret(): string | null {
  return process.env.META_APP_SECRET?.trim() || null;
}

function envIgToken(): string | null {
  return process.env.IG_ACCESS_TOKEN?.trim() || null;
}

function appAccessToken(): string | null {
  const id = metaAppId();
  const secret = metaAppSecret();
  if (!id || !secret) return null;
  return `${id}|${secret}`;
}

export async function readStoredIgAccessToken(): Promise<{
  token: string | null;
  updatedAt: Date | null;
}> {
  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, IG_TOKEN_SETTING_KEY))
      .limit(1);
    if (row?.value?.trim()) {
      return { token: row.value.trim(), updatedAt: row.updatedAt };
    }
  } catch {
    /* table may not exist yet before migrate */
  }
  return { token: null, updatedAt: null };
}

/** Prefer DB-refreshed token, then env bootstrap. */
let cachedToken: { value: string | null; at: number } | null = null;
const TOKEN_CACHE_MS = 60_000;

export async function resolveIgAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() - cachedToken.at < TOKEN_CACHE_MS) {
    return cachedToken.value;
  }
  const stored = await readStoredIgAccessToken();
  const value = stored.token || envIgToken();
  cachedToken = { value, at: Date.now() };
  return value;
}

export async function persistIgAccessToken(token: string): Promise<void> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({
      key: IG_TOKEN_SETTING_KEY,
      value: token.trim(),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: token.trim(), updatedAt: now },
    });
  process.env.IG_ACCESS_TOKEN = token.trim();
  cachedToken = { value: token.trim(), at: Date.now() };
}

type DebugTokenData = {
  app_id?: string;
  is_valid?: boolean;
  expires_at?: number;
  data_access_expires_at?: number;
  scopes?: string[];
  error?: { message?: string; code?: number };
};

async function debugToken(inputToken: string): Promise<{
  data: DebugTokenData | null;
  error: string | null;
}> {
  const appTok = appAccessToken();
  if (!appTok) {
    return {
      data: null,
      error: "META_APP_ID / META_APP_SECRET not set — cannot inspect expiry",
    };
  }
  const url = new URL(`${GRAPH}/debug_token`);
  url.searchParams.set("input_token", inputToken);
  url.searchParams.set("access_token", appTok);
  const res = await fetch(url);
  const body = (await res.json()) as {
    data?: DebugTokenData;
    error?: { message?: string };
  };
  if (!res.ok || body.error) {
    return {
      data: null,
      error: body.error?.message ?? `debug_token HTTP ${res.status}`,
    };
  }
  return { data: body.data ?? null, error: null };
}

function epochToIso(sec: number | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  return new Date(sec * 1000).toISOString();
}

function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.floor(ms / 86400000);
}

export async function getIgTokenStatus(
  now = new Date(),
): Promise<IgTokenStatus> {
  const stored = await readStoredIgAccessToken();
  const envTok = envIgToken();
  const token = stored.token || envTok;
  const source: IgTokenStatus["source"] = stored.token
    ? "db"
    : envTok
      ? "env"
      : null;
  const metaAppConfigured = Boolean(metaAppId() && metaAppSecret());
  const businessUserIdConfigured = Boolean(
    process.env.IG_BUSINESS_USER_ID?.trim(),
  );

  if (!token) {
    return {
      configured: false,
      source: null,
      metaAppConfigured,
      businessUserIdConfigured,
      valid: null,
      expiresAt: null,
      expiresInDays: null,
      dataAccessExpiresAt: null,
      scopes: [],
      error: "IG_ACCESS_TOKEN not set",
      canRenew: false,
      shouldRenew: false,
      tokenUpdatedAt: null,
    };
  }

  const { data, error } = await debugToken(token);
  const expiresAt = epochToIso(data?.expires_at);
  // expires_at === 0 means non-expiring page token in some Meta flows
  const neverExpires = data?.expires_at === 0;
  const expiresInDays = neverExpires ? null : daysUntil(expiresAt, now);
  const valid = data?.is_valid ?? null;
  const canRenew = metaAppConfigured && valid === true && !neverExpires;
  const shouldRenew =
    canRenew &&
    expiresInDays != null &&
    expiresInDays >= 0 &&
    expiresInDays < IG_TOKEN_RENEW_WITHIN_DAYS;

  return {
    configured: true,
    source,
    metaAppConfigured,
    businessUserIdConfigured,
    valid,
    expiresAt: neverExpires ? null : expiresAt,
    expiresInDays: neverExpires ? null : expiresInDays,
    dataAccessExpiresAt: epochToIso(data?.data_access_expires_at),
    scopes: data?.scopes ?? [],
    error: error ?? (data?.error?.message ? data.error.message : null),
    canRenew,
    shouldRenew,
    tokenUpdatedAt: stored.updatedAt?.toISOString() ?? null,
  };
}

export async function renewIgAccessToken(opts?: {
  /** Fresh Graph Explorer / short-lived user token to exchange. */
  shortLivedToken?: string;
}): Promise<{
  ok: boolean;
  status: IgTokenStatus;
  error?: string;
}> {
  const id = metaAppId();
  const secret = metaAppSecret();
  if (!id || !secret) {
    return {
      ok: false,
      status: await getIgTokenStatus(),
      error: "META_APP_ID / META_APP_SECRET required to renew",
    };
  }

  const incoming = opts?.shortLivedToken?.trim() || null;
  const current = incoming || (await resolveIgAccessToken());
  if (!current) {
    return {
      ok: false,
      status: await getIgTokenStatus(),
      error: "Paste a short-lived Graph token, or set IG_ACCESS_TOKEN",
    };
  }

  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("fb_exchange_token", current);

  const res = await fetch(url);
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!res.ok || !body.access_token) {
    return {
      ok: false,
      status: await getIgTokenStatus(),
      error: body.error?.message ?? `Token exchange HTTP ${res.status}`,
    };
  }

  await persistIgAccessToken(body.access_token);
  const status = await getIgTokenStatus();
  return { ok: true, status };
}

/**
 * If the long-lived token is valid but near expiry, renew it.
 * Safe to call from ingest / admin; no-ops when Meta app creds missing.
 */
export async function maybeAutoRenewIgAccessToken(): Promise<{
  renewed: boolean;
  status: IgTokenStatus;
  error?: string;
}> {
  const status = await getIgTokenStatus();
  if (!status.shouldRenew) {
    return { renewed: false, status };
  }
  const result = await renewIgAccessToken();
  return {
    renewed: result.ok,
    status: result.status,
    error: result.error,
  };
}
