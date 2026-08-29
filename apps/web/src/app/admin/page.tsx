"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../lib/admin-api";

type AdapterRow = {
  id: string;
  phase1: boolean;
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    itemsUpserted: number | null;
    error: string | null;
  } | null;
};

type Schedule = {
  id: string;
  cron: string;
  label: string;
  scope: string;
  adapterIds?: string[];
  description: string;
};

type Job = {
  id: string;
  scope: string;
  adapterIds: string[];
  status: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

type Run = {
  id: string;
  adapterId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsUpserted: number | null;
  error: string | null;
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function AdminIngestPage() {
  const [adapters, setAdapters] = useState<AdapterRow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, j, r] = await Promise.all([
        adminApi<{ adapters: AdapterRow[]; schedules: Schedule[] }>(
          "/ingest/adapters",
        ),
        adminApi<{ jobs: Job[] }>("/ingest/jobs?limit=20"),
        adminApi<{ runs: Run[] }>("/ingest/runs?limit=40"),
      ]);
      setAdapters(a.adapters);
      setSchedules(a.schedules);
      setJobs(j.jobs);
      setRuns(r.runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function enqueue(
    scope: "phase1" | "all" | "adapters",
    adapterIds?: string[],
  ) {
    const key = adapterIds?.join(",") ?? scope;
    setBusy(key);
    try {
      await adminApi("/ingest/jobs", {
        method: "POST",
        body: JSON.stringify({ scope, adapterIds }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enqueue failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Ingest</h1>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn"
            disabled={!!busy}
            onClick={() => void enqueue("phase1")}
          >
            Run Phase 1
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={!!busy}
            onClick={() => void enqueue("all")}
          >
            Run all
          </button>
          <button type="button" className="admin-btn ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}

      <section className="admin-section">
        <h2>Schedules (read-only)</h2>
        <p className="admin-muted">
          Hardcoded crons on the ingest worker. Editable DB schedules land in Phase 2.
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cadence</th>
              <th>Cron</th>
              <th>Scope</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>
                  <code>{s.cron}</code>
                </td>
                <td>
                  {s.scope}
                  {s.adapterIds?.length ? ` (${s.adapterIds.join(", ")})` : ""}
                </td>
                <td>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Adapters</h2>
        <div className="admin-adapter-grid">
          {adapters.map((a) => (
            <div key={a.id} className="admin-card">
              <div className="admin-card-head">
                <strong>{a.id}</strong>
                {a.phase1 ? <span className="admin-chip">phase1</span> : null}
                <span
                  className={`admin-status ${a.lastRun?.status ?? "none"}`}
                >
                  {a.lastRun?.status ?? "never"}
                </span>
              </div>
              <p className="admin-muted">
                Last: {fmt(a.lastRun?.finishedAt ?? a.lastRun?.startedAt)}
                {a.lastRun?.itemsUpserted != null
                  ? ` · ${a.lastRun.itemsUpserted} upserted`
                  : ""}
              </p>
              {a.lastRun?.error ? (
                <p className="admin-error small">{a.lastRun.error.slice(0, 160)}</p>
              ) : null}
              <button
                type="button"
                className="admin-btn small"
                disabled={!!busy}
                onClick={() => void enqueue("adapters", [a.id])}
              >
                {busy === a.id ? "…" : "Run now"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2>Job queue</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Requested</th>
              <th>Scope</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{fmt(j.requestedAt)}</td>
                <td>
                  {j.scope}
                  {j.adapterIds?.length
                    ? `: ${j.adapterIds.join(", ")}`
                    : ""}
                </td>
                <td>
                  <span className={`admin-status ${j.status}`}>{j.status}</span>
                </td>
                <td className="admin-muted">{j.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Recent runs</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Adapter</th>
              <th>Status</th>
              <th>Upserted</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.startedAt)}</td>
                <td>{r.adapterId}</td>
                <td>
                  <span className={`admin-status ${r.status}`}>{r.status}</span>
                </td>
                <td>{r.itemsUpserted ?? "—"}</td>
                <td className="admin-muted">
                  {r.error ? r.error.slice(0, 120) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
