"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../../lib/admin-api";

type OutboundStats = {
  days: number;
  total: number;
  byDay: { day: string; n: number }[];
  byCity: { city: string | null; n: number }[];
  bySource: { source: string | null; n: number }[];
  byNetwork: { affiliateNetwork: string | null; n: number }[];
  byHost: { destinationHost: string | null; n: number }[];
  topEvents: { eventId: string; title: string | null; n: number }[];
};

export default function AdminReportsPage() {
  const [days, setDays] = useState("30");
  const [city, setCity] = useState("");
  const [stats, setStats] = useState<OutboundStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ days });
      if (city) params.set("city", city);
      const data = await adminApi<OutboundStats>(`/stats/outbound?${params}`);
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, [days, city]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Outbound reports</h1>
        <div className="admin-filters">
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
          <input
            placeholder="city filter"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <button type="button" className="admin-btn ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}

      {stats ? (
        <>
          <div className="admin-stat-strip">
            <div>
              <strong>{stats.total}</strong>
              <span>Clicks ({stats.days}d)</span>
            </div>
          </div>

          <section className="admin-section">
            <h2>By day</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {stats.byDay.map((r) => (
                  <tr key={r.day}>
                    <td>{r.day}</td>
                    <td>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="admin-two-tables">
            <section className="admin-section">
              <h2>By city</h2>
              <table className="admin-table">
                <tbody>
                  {stats.byCity.map((r) => (
                    <tr key={String(r.city)}>
                      <td>{r.city ?? "—"}</td>
                      <td>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="admin-section">
              <h2>By network</h2>
              <table className="admin-table">
                <tbody>
                  {stats.byNetwork.map((r) => (
                    <tr key={String(r.affiliateNetwork)}>
                      <td>{r.affiliateNetwork ?? "utm only"}</td>
                      <td>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="admin-section">
            <h2>Top destinations</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {stats.byHost.map((r) => (
                  <tr key={String(r.destinationHost)}>
                    <td>{r.destinationHost ?? "—"}</td>
                    <td>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="admin-section">
            <h2>Top events</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {stats.topEvents.map((r) => (
                  <tr key={r.eventId}>
                    <td>
                      <a href={`/admin/listings/${r.eventId}`}>
                        {r.title ?? r.eventId}
                      </a>
                    </td>
                    <td>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="admin-section">
            <h2>By source</h2>
            <table className="admin-table">
              <tbody>
                {stats.bySource.map((r) => (
                  <tr key={String(r.source)}>
                    <td>{r.source ?? "—"}</td>
                    <td>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
