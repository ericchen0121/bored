"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../../lib/admin-api";

type ServiceDeploy = {
  serviceId: string;
  serviceName: string;
  cronSchedule: string | null;
  nextCronRunAt: string | null;
  latest: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    staticUrl: string | null;
    reason: string | null;
    buildOnly: boolean | null;
    commitHash: string | null;
    commitMessage: string | null;
    branch: string | null;
    repo: string | null;
  } | null;
  dashboardUrl: string;
};

type RecentDeploy = {
  id: string;
  serviceId: string;
  serviceName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reason: string | null;
  buildOnly: boolean | null;
  dashboardUrl: string;
};

type DeploysPayload = {
  configured: boolean;
  error?: string;
  projectId: string | null;
  projectName: string | null;
  environmentId: string | null;
  environmentName: string | null;
  dashboardUrl: string | null;
  services: ServiceDeploy[];
  recent: RecentDeploy[];
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusClass(status: string | null | undefined) {
  const s = (status ?? "none").toUpperCase();
  if (s === "SUCCESS") return "ok";
  if (
    s === "FAILED" ||
    s === "CRASHED" ||
    s === "REMOVED" ||
    s === "SKIPPED"
  ) {
    return "error";
  }
  if (
    s === "BUILDING" ||
    s === "DEPLOYING" ||
    s === "INITIALIZING" ||
    s === "QUEUED" ||
    s === "WAITING" ||
    s === "NEEDS_APPROVAL"
  ) {
    return "running";
  }
  return "none";
}

export default function AdminDeploysPage() {
  const [data, setData] = useState<DeploysPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminApi<DeploysPayload>("/deploys");
      setData(payload);
      setError(payload.error ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Deploys</h1>
        <div className="admin-actions">
          {data?.dashboardUrl ? (
            <a
              className="admin-btn"
              href={data.dashboardUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Railway
            </a>
          ) : null}
          <button
            type="button"
            className="admin-btn ghost"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </div>

      {data?.projectName ? (
        <p className="admin-muted">
          {data.projectName}
          {data.environmentName ? ` · ${data.environmentName}` : ""}
          {data.projectId ? (
            <>
              {" "}
              · <code>{data.projectId.slice(0, 8)}</code>
            </>
          ) : null}
        </p>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      <section className="admin-section">
        <h2>Services</h2>
        <div className="admin-adapter-grid">
          {(data?.services ?? []).map((s) => (
            <div key={s.serviceId} className="admin-card">
              <div className="admin-card-head">
                <strong>{s.serviceName}</strong>
                <span
                  className={`admin-status ${statusClass(s.latest?.status)}`}
                >
                  {s.latest?.status ?? "never"}
                </span>
              </div>
              <p className="admin-muted">
                Last: {fmt(s.latest?.updatedAt ?? s.latest?.createdAt)}
                {s.latest?.buildOnly ? " · build only" : ""}
                {s.cronSchedule ? ` · cron ${s.cronSchedule}` : ""}
              </p>
              {s.latest?.staticUrl ? (
                <p className="admin-muted">
                  <a
                    href={`https://${s.latest.staticUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.latest.staticUrl}
                  </a>
                </p>
              ) : null}
              {s.latest?.commitHash ? (
                <p className="admin-muted">
                  <code>{s.latest.commitHash.slice(0, 7)}</code>
                  {s.latest.branch ? ` · ${s.latest.branch}` : ""}
                  {s.latest.commitMessage
                    ? ` — ${s.latest.commitMessage.slice(0, 80)}`
                    : ""}
                </p>
              ) : null}
              <a
                className="admin-btn small"
                href={s.dashboardUrl}
                target="_blank"
                rel="noreferrer"
              >
                Railway
              </a>
            </div>
          ))}
        </div>
        {!data?.services.length && !error ? (
          <p className="admin-muted">Loading…</p>
        ) : null}
      </section>

      <section className="admin-section">
        <h2>Recent deployments</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Service</th>
              <th>Status</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.recent ?? []).map((d) => (
              <tr key={d.id}>
                <td>{fmt(d.createdAt)}</td>
                <td>{d.serviceName}</td>
                <td>
                  <span className={`admin-status ${statusClass(d.status)}`}>
                    {d.status}
                  </span>
                </td>
                <td className="admin-muted">
                  {[d.reason, d.buildOnly ? "build only" : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td>
                  <a href={d.dashboardUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
