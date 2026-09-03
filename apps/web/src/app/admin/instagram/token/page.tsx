"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../../../../lib/admin-api";

type IgTokenStatus = {
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

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function expiryTone(status: IgTokenStatus): "ok" | "warn" | "bad" | "muted" {
  if (!status.configured) return "muted";
  if (status.valid === false) return "bad";
  if (status.expiresInDays == null) return status.valid ? "ok" : "muted";
  if (status.expiresInDays < 0) return "bad";
  if (status.expiresInDays < 14) return "warn";
  return "ok";
}

export default function AdminInstagramTokenPage() {
  const [status, setStatus] = useState<IgTokenStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"renew" | "exchange" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [shortLived, setShortLived] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await adminApi<{ status: IgTokenStatus }>(
        "/instagram/token",
      );
      setStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function renewExisting() {
    setBusy("renew");
    setNote(null);
    try {
      const data = await adminApi<{ status: IgTokenStatus; renewed: boolean }>(
        "/instagram/token/renew",
        { method: "POST", body: JSON.stringify({}) },
      );
      setStatus(data.status);
      setNote(
        data.status.expiresInDays != null
          ? `Renewed. Expires in ~${data.status.expiresInDays} days.`
          : "Renewed.",
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renew failed");
    } finally {
      setBusy(null);
    }
  }

  async function exchange(e: FormEvent) {
    e.preventDefault();
    const token = shortLived.trim();
    if (!token) return;
    setBusy("exchange");
    setNote(null);
    try {
      const data = await adminApi<{ status: IgTokenStatus; renewed: boolean }>(
        "/instagram/token/renew",
        {
          method: "POST",
          body: JSON.stringify({ shortLivedToken: token }),
        },
      );
      setStatus(data.status);
      setShortLived("");
      setNote(
        data.status.expiresInDays != null
          ? `Exchanged to a long-lived token (~${data.status.expiresInDays}d). Stored in DB — no .env edit needed.`
          : "Exchanged and stored in DB.",
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exchange failed");
    } finally {
      setBusy(null);
    }
  }

  const tone = status ? expiryTone(status) : "muted";

  return (
    <>
      <p className="admin-muted">
        Paste a fresh{" "}
        <a
          href="https://developers.facebook.com/tools/explorer/"
          target="_blank"
          rel="noreferrer"
        >
          Graph Explorer
        </a>{" "}
        user token below — the API exchanges it with{" "}
        <code>META_APP_ID</code> / <code>META_APP_SECRET</code> and stores a
        ~60-day token in the DB (shared by API + ingest). Safer than putting
        short-lived tokens in <code>.env</code>.
      </p>

      {error ? <p className="admin-error">{error}</p> : null}
      {note ? <p className="admin-ok">{note}</p> : null}

      <section className="admin-section">
        <h2>Paste short-lived token</h2>
        <form className="admin-ig-token-form" onSubmit={(e) => void exchange(e)}>
          <textarea
            className="admin-input admin-ig-token-input"
            value={shortLived}
            onChange={(e) => setShortLived(e.target.value)}
            placeholder="Paste Graph Explorer access token…"
            rows={3}
            spellCheck={false}
            autoComplete="off"
            aria-label="Short-lived Instagram / Facebook user access token"
          />
          <div className="admin-row-actions">
            <button
              type="submit"
              className="admin-btn"
              disabled={
                busy !== null ||
                !shortLived.trim() ||
                !status?.metaAppConfigured
              }
              title={
                status?.metaAppConfigured
                  ? "Exchange for a ~60-day token and save to DB"
                  : "Set META_APP_ID and META_APP_SECRET first"
              }
            >
              {busy === "exchange" ? "Exchanging…" : "Exchange & save"}
            </button>
          </div>
        </form>
        {!status?.metaAppConfigured ? (
          <p className="admin-error small">
            META_APP_ID / META_APP_SECRET missing — exchange cannot run.
          </p>
        ) : null}
      </section>

      <section className="admin-section">
        <div className="admin-card-head">
          <h2>Current token</h2>
          <div className="admin-row-actions">
            <button
              type="button"
              className="admin-btn ghost"
              onClick={() => void load()}
              disabled={busy !== null}
            >
              Refresh
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => void renewExisting()}
              disabled={busy !== null || !status?.canRenew}
              title={
                status?.canRenew
                  ? "Extend the existing long-lived token another ~60 days"
                  : "Only works while the current token is still valid"
              }
            >
              {busy === "renew" ? "Renewing…" : "Renew existing"}
            </button>
          </div>
        </div>

        {!status ? (
          <p className="admin-muted">Loading…</p>
        ) : (
          <dl className={`admin-kv admin-kv--${tone}`}>
            <div>
              <dt>Status</dt>
              <dd>
                {!status.configured
                  ? "Not configured"
                  : status.valid === false
                    ? "Invalid / expired"
                    : status.valid
                      ? status.shouldRenew
                        ? "Valid — renew soon"
                        : "Valid"
                      : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {status.expiresAt
                  ? `${fmt(status.expiresAt)}${
                      status.expiresInDays != null
                        ? ` (${status.expiresInDays}d)`
                        : ""
                    }`
                  : status.valid
                    ? "No expiry reported"
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {status.source === "db"
                  ? "Database (preferred)"
                  : status.source === "env"
                    ? "Environment (.env)"
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>Last saved</dt>
              <dd>{fmt(status.tokenUpdatedAt)}</dd>
            </div>
            <div>
              <dt>Meta app</dt>
              <dd>
                {status.metaAppConfigured
                  ? "Configured"
                  : "Missing App ID/Secret"}
              </dd>
            </div>
            <div>
              <dt>Business user</dt>
              <dd>
                {status.businessUserIdConfigured
                  ? "IG_BUSINESS_USER_ID set"
                  : "Missing"}
              </dd>
            </div>
            {status.dataAccessExpiresAt ? (
              <div>
                <dt>Data access expires</dt>
                <dd>{fmt(status.dataAccessExpiresAt)}</dd>
              </div>
            ) : null}
            {status.scopes.length > 0 ? (
              <div>
                <dt>Scopes</dt>
                <dd className="admin-mono">{status.scopes.join(", ")}</dd>
              </div>
            ) : null}
            {status.error ? (
              <div>
                <dt>Detail</dt>
                <dd>{status.error}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </section>

      <section className="admin-section">
        <h2>How to get a token</h2>
        <ol className="admin-steps">
          <li>
            Open{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
            >
              Graph API Explorer
            </a>{" "}
            → same Meta app as <code>META_APP_ID</code>.
          </li>
          <li>
            Generate a <strong>User</strong> token with Instagram / pages perms
            you already use for business discovery.
          </li>
          <li>
            Paste it above and hit <strong>Exchange &amp; save</strong> within
            about an hour (Explorer tokens expire quickly).
          </li>
          <li>
            Optional: keep a bootstrap long-lived token in{" "}
            <code>IG_ACCESS_TOKEN</code>; after the first exchange, DB wins.
          </li>
        </ol>
      </section>
    </>
  );
}
