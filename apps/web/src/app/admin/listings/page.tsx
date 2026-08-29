"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../../../lib/admin-api";

type EventSummary = {
  id: string;
  source: string;
  sourceEventId: string;
  kind: string;
  title: string;
  city: string;
  startsAt: string;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
  isSponsored: boolean;
  sponsorId: string | null;
  hidden: boolean;
  lastSeenAt: string;
};

type Coverage = {
  source: string;
  total: number;
  missingCategories: number;
  emptyTags: number;
};

export default function AdminListingsPage() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [city, setCity] = useState("");
  const [sponsored, setSponsored] = useState("");
  const [hidden, setHidden] = useState("0");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (source) params.set("source", source);
      if (city) params.set("city", city);
      if (sponsored) params.set("sponsored", sponsored);
      if (hidden) params.set("hidden", hidden);
      params.set("limit", "50");
      const data = await adminApi<{ events: EventSummary[] }>(
        `/events?${params}`,
      );
      setEvents(data.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }, [q, source, city, sponsored, hidden]);

  useEffect(() => {
    void search();
    void adminApi<{ bySource: Coverage[] }>("/stats/tag-coverage")
      .then((d) => setCoverage(d.bySource))
      .catch(() => undefined);
  }, [search]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void search();
  }

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Listings</h1>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}

      <form className="admin-filters" onSubmit={onSubmit}>
        <input
          placeholder="Search title, id, sourceEventId"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          placeholder="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          placeholder="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <select
          value={sponsored}
          onChange={(e) => setSponsored(e.target.value)}
        >
          <option value="">Any sponsorship</option>
          <option value="1">Sponsored</option>
          <option value="0">Organic</option>
        </select>
        <select value={hidden} onChange={(e) => setHidden(e.target.value)}>
          <option value="">Any visibility</option>
          <option value="0">Visible</option>
          <option value="1">Hidden</option>
        </select>
        <button type="submit" className="admin-btn">
          Search
        </button>
      </form>

      <section className="admin-section">
        <h2>Results</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>City</th>
              <th>Starts</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td>
                  <Link href={`/admin/listings/${ev.id}`}>{ev.title}</Link>
                </td>
                <td>{ev.source}</td>
                <td>{ev.city}</td>
                <td>{new Date(ev.startsAt).toLocaleString()}</td>
                <td>
                  {ev.isSponsored ? (
                    <span className="admin-chip">sponsored</span>
                  ) : null}
                  {ev.hidden ? <span className="admin-chip warn">hidden</span> : null}
                  {!ev.imageUrl ? (
                    <span className="admin-chip muted">no image</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Tag coverage</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Total</th>
              <th>Missing categories</th>
              <th>Empty tags</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((row) => (
              <tr key={row.source}>
                <td>{row.source}</td>
                <td>{row.total}</td>
                <td>{row.missingCategories}</td>
                <td>{row.emptyTags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
