"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminApi, clearAdminToken, setAdminToken } from "../../../lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAdminToken(token.trim());
      await adminApi<{ ok: boolean }>("/health");
      router.replace("/admin");
    } catch (err) {
      clearAdminToken();
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <h1>Admin</h1>
      <p className="admin-muted">
        Enter the <code>ADMIN_TOKEN</code> from your environment.
      </p>
      <form onSubmit={onSubmit} className="admin-form">
        <label>
          Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="admin-error">{error}</p> : null}
        <button type="submit" className="admin-btn" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
