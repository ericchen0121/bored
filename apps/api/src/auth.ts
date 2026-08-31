import {
  authTokens,
  db,
  sessions,
  signals,
  userProfiles,
  users,
} from "@bored/db";
import {
  feedCityFromPath,
  magicLinkEmailCopy,
  parseFeedCitySlug,
  type FeedCity,
} from "@bored/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function parseBearerToken(
  authorization: string | undefined,
): string | null {
  const raw = authorization?.trim();
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || null;
}

export function anonymousUserIdFromHeader(
  header: string | undefined,
  fallback: string,
): string {
  const raw = header?.trim();
  if (raw && UUID_RE.test(raw)) return raw;
  return UUID_RE.test(fallback) ? fallback : fallback;
}

export async function resolveAuthenticatedUserId(
  authorization: string | undefined,
): Promise<string | null> {
  const token = parseBearerToken(authorization);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(
      and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
    )
    .limit(1);
  return row?.userId ?? null;
}

export async function resolveUserId(
  authorization: string | undefined,
  anonymousHeader: string | undefined,
  fallbackAnonymousId: string,
): Promise<string> {
  const authed = await resolveAuthenticatedUserId(authorization);
  if (authed) return authed;
  return anonymousUserIdFromHeader(anonymousHeader, fallbackAnonymousId);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function webOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

function authFromEmail(): string {
  return process.env.AUTH_FROM_EMAIL?.trim() || "Bored <onboarding@resend.dev>";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolveMagicLinkCity(input: {
  city?: string;
  returnTo?: string | null;
}): FeedCity | null {
  return (
    parseFeedCitySlug(input.city) ?? feedCityFromPath(input.returnTo) ?? null
  );
}

function buildMagicLinkEmailHtml(url: string, city: FeedCity | null): string {
  const copy = magicLinkEmailCopy(city);
  const safeUrl = escapeHtml(url);
  const hero =
    copy.heroImageUrl && copy.heroAlt
      ? `<img src="${escapeHtml(copy.heroImageUrl)}" alt="${escapeHtml(copy.heroAlt)}" width="440" style="display:block;width:100%;max-width:440px;height:auto;border-radius:14px;margin:0 0 24px" />`
      : "";

  return `<div style="font-family:'DM Sans',system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:440px;margin:0 auto;padding:32px 20px">
  <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:700;letter-spacing:-0.05em;line-height:1;color:#0c1218">b<span style="color:#e8a54b">.</span></p>
  ${hero}
  <p style="margin:0 0 10px;font-size:20px;font-weight:600;line-height:1.3;color:#0c1218">${escapeHtml(copy.headline)}</p>
  <p style="margin:0 0 24px;font-size:15px;color:#333">${escapeHtml(copy.body)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px">
    <tr>
      <td style="border-radius:12px;background:#e8a54b">
        <a href="${safeUrl}" style="display:inline-block;padding:16px 36px;font-size:18px;font-weight:600;line-height:1.2;color:#0c1218;text-decoration:none;border-radius:12px">${escapeHtml(copy.cta)}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0;color:#666;font-size:13px">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>
</div>`;
}

async function sendMagicLinkEmail(
  email: string,
  url: string,
  city: FeedCity | null,
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    console.log(
      `[auth] RESEND_API_KEY missing — magic link for ${email}: ${url}`,
    );
    return;
  }

  const copy = magicLinkEmailCopy(city);
  const from = authFromEmail();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: copy.subject,
      text: `${copy.headline}\n\n${copy.body}\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request it, you can ignore this email.`,
      html: buildMagicLinkEmailHtml(url, city),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend ${res.status}: ${detail}`);
  }

  console.log(`[auth] Sent magic link via Resend to ${email} (from ${from})`);
}

export async function requestMagicLink(input: {
  email: string;
  returnTo?: string;
  city?: string;
  anonymousUserId?: string;
}): Promise<{ ok: true }> {
  const email = normalizeEmail(input.email);
  const token = newOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  const anonymousUserId =
    input.anonymousUserId && UUID_RE.test(input.anonymousUserId)
      ? input.anonymousUserId
      : null;

  if (anonymousUserId) {
    await db
      .insert(users)
      .values({ id: anonymousUserId })
      .onConflictDoNothing();
  }

  await db.insert(authTokens).values({
    email,
    tokenHash,
    anonymousUserId,
    expiresAt,
  });

  const returnTo = sanitizeReturnTo(input.returnTo);
  const city = resolveMagicLinkCity({ city: input.city, returnTo });
  const verifyUrl = `${webOrigin()}/auth/verify?token=${encodeURIComponent(token)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  await sendMagicLinkEmail(email, verifyUrl, city);

  return { ok: true };
}

function sanitizeReturnTo(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.startsWith("/admin")) return null;
  return path;
}

async function findOrCreateEmailUser(email: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) return existing.id;

  await db
    .insert(users)
    .values({ email, displayName: email.split("@")[0] ?? "You" })
    .onConflictDoNothing();

  const [created] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!created) throw new Error("Could not create user");
  return created.id;
}

async function mergeAnonymousIntoUser(
  anonymousId: string,
  emailUserId: string,
): Promise<void> {
  if (anonymousId === emailUserId) return;

  const [anonProfile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, anonymousId))
    .limit(1);
  const [emailProfile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, emailUserId))
    .limit(1);

  const anonHasPrefs =
    Boolean(anonProfile?.interests?.length) ||
    Boolean(anonProfile?.neighborhoods?.length) ||
    anonProfile?.onboardingComplete;

  if (anonProfile && (!emailProfile || !emailProfile.onboardingComplete)) {
    if (emailProfile) {
      await db
        .update(userProfiles)
        .set({
          interests: anonHasPrefs
            ? anonProfile.interests
            : emailProfile.interests,
          neighborhoods: anonProfile.neighborhoods.length
            ? anonProfile.neighborhoods
            : emailProfile.neighborhoods,
          budgetMax: anonProfile.budgetMax ?? emailProfile.budgetMax,
          budgetTier: anonProfile.budgetTier ?? emailProfile.budgetTier,
          budgetEnabled:
            anonProfile.budgetEnabled || emailProfile.budgetEnabled,
          preferFree: anonProfile.preferFree ?? emailProfile.preferFree,
          nightsOut: anonProfile.nightsOut ?? emailProfile.nightsOut,
          radiusMiles: anonProfile.radiusMiles ?? emailProfile.radiusMiles,
          lat: anonProfile.lat ?? emailProfile.lat,
          lng: anonProfile.lng ?? emailProfile.lng,
          onboardingComplete:
            anonProfile.onboardingComplete || emailProfile.onboardingComplete,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, emailUserId));
    } else if (anonHasPrefs) {
      await db.insert(userProfiles).values({
        userId: emailUserId,
        interests: anonProfile.interests,
        neighborhoods: anonProfile.neighborhoods,
        budgetMax: anonProfile.budgetMax,
        budgetTier: anonProfile.budgetTier,
        budgetEnabled: anonProfile.budgetEnabled ?? false,
        preferFree: anonProfile.preferFree ?? false,
        nightsOut: anonProfile.nightsOut ?? true,
        radiusMiles: anonProfile.radiusMiles ?? 15,
        lat: anonProfile.lat,
        lng: anonProfile.lng,
        onboardingComplete: anonProfile.onboardingComplete,
        updatedAt: new Date(),
      });
    }
  }

  const anonSignals = await db
    .select()
    .from(signals)
    .where(eq(signals.userId, anonymousId));

  if (anonSignals.length) {
    await db
      .insert(signals)
      .values(
        anonSignals.map((s) => ({
          userId: emailUserId,
          targetKind: s.targetKind,
          targetId: s.targetId,
          type: s.type,
        })),
      )
      .onConflictDoNothing();
  }

  await db.delete(users).where(eq(users.id, anonymousId));
}

async function createSession(userId: string): Promise<string> {
  const token = newOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return token;
}

export async function verifyMagicLink(input: {
  token: string;
  anonymousUserId?: string;
}): Promise<{
  sessionToken: string;
  user: { id: string; email: string | null; displayName: string | null };
}> {
  const tokenHash = hashToken(input.token.trim());
  const now = new Date();

  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Invalid or expired link");
  }

  await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(eq(authTokens.id, row.id));

  const emailUserId = await findOrCreateEmailUser(row.email);

  const anonymousId =
    (input.anonymousUserId && UUID_RE.test(input.anonymousUserId)
      ? input.anonymousUserId
      : null) ?? row.anonymousUserId;

  if (anonymousId && anonymousId !== emailUserId) {
    await mergeAnonymousIntoUser(anonymousId, emailUserId);
  }

  const sessionToken = await createSession(emailUserId);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, emailUserId))
    .limit(1);

  return {
    sessionToken,
    user: {
      id: emailUserId,
      email: user?.email ?? row.email,
      displayName: user?.displayName ?? null,
    },
  };
}

export async function revokeSession(authorization: string | undefined): Promise<void> {
  const token = parseBearerToken(authorization);
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
