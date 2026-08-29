"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../../../lib/admin-api";

type SponsorRow = {
  id: string;
  name: string;
  metro: string;
  package: string;
  contactEmail: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  activeBoostCount: number;
};

type Inventory = {
  activeSponsors: number;
  activeBoostedEvents: number;
  staleBoostedEvents: number;
  visibleEvents: number;
};

export default function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [metro, setMetro] = useState("sf");
  const [pkg, setPkg] = useState("venue_boost");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, inv] = await Promise.all([
        adminApi<{ sponsors: SponsorRow[] }>("/sponsors"),
        adminApi<Inventory>("/stats/sponsors"),
      ]);
      setSponsors(s.sponsors);
      setInventory(inv);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await adminApi("/sponsors", {
        method: "POST",
        body: JSON.stringify({
          name,
          metro,
          package: pkg,
          contactEmail: email || null,
        }),
      });
      setName("");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function clearStale() {
    try {
      await adminApi("/stats/sponsors/clear-stale", { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    }
  }

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Sponsors</h1>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}

      {inventory ? (
        <div className="admin-stat-strip">
          <div>
            <strong>{inventory.activeSponsors}</strong>
            <span>Active sponsors</span>
          </div>
          <div>
            <strong>{inventory.activeBoostedEvents}</strong>
            <span>Active boosts</span>
          </div>
          <div>
            <strong>{inventory.staleBoostedEvents}</strong>
            <span>Stale (past end)</span>
            {inventory.staleBoostedEvents > 0 ? (
              <button type="button" className="admin-btn small" onClick={() => void clearStale()}>
                Clear stale
              </button>
            ) : null}
          </div>
          <div>
            <strong>{inventory.visibleEvents}</strong>
            <span>Visible events</span>
          </div>
        </div>
      ) : null}

      <section className="admin-section">
        <h2>New sponsor</h2>
        <form className="admin-filters" onSubmit={create}>
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <select value={metro} onChange={(e) => setMetro(e.target.value)}>
            <option value="sf">sf</option>
            <option value="bay">bay</option>
            <option value="chicago">chicago</option>
          </select>
          <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="venue_boost">venue_boost</option>
            <option value="happy_hour">happy_hour</option>
            <option value="festival">festival</option>
          </select>
          <input
            placeholder="Contact email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="admin-btn">
            Create
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h2>All sponsors</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Metro</th>
              <th>Package</th>
              <th>Boosts</th>
              <th>Active</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            {sponsors.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/admin/sponsors/${s.id}`}>{s.name}</Link>
                </td>
                <td>{s.metro}</td>
                <td>{s.package}</td>
                <td>{s.activeBoostCount}</td>
                <td>{s.active ? "yes" : "no"}</td>
                <td className="admin-muted">{s.contactEmail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
