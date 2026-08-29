"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../../../../lib/admin-api";

type Sponsor = {
  id: string;
  name: string;
  metro: string;
  package: string;
  contactEmail: string | null;
  notes: string | null;
  active: boolean;
};

type BoostedEvent = {
  id: string;
  title: string;
  source: string;
  city: string;
  startsAt: string;
  isSponsored: boolean;
  boostWeight: number;
  sponsorEndsAt: string | null;
  hidden: boolean;
};

export default function AdminSponsorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [events, setEvents] = useState<BoostedEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outboundTotal, setOutboundTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, out] = await Promise.all([
        adminApi<{ sponsor: Sponsor; events: BoostedEvent[] }>(
          `/sponsors/${id}`,
        ),
        adminApi<{ total: number }>(`/stats/outbound?days=30&sponsorId=${id}`),
      ]);
      setSponsor(data.sponsor);
      setEvents(data.events);
      setOutboundTotal(out.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSponsor(e: FormEvent) {
    e.preventDefault();
    if (!sponsor) return;
    try {
      const { sponsor: updated } = await adminApi<{ sponsor: Sponsor }>(
        `/sponsors/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: sponsor.name,
            metro: sponsor.metro,
            package: sponsor.package,
            contactEmail: sponsor.contactEmail,
            notes: sponsor.notes,
            active: sponsor.active,
          }),
        },
      );
      setSponsor(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function attachBoost(trial = false) {
    if (!eventId.trim()) return;
    try {
      const ends = trial
        ? new Date(Date.now() + 14 * 86400000).toISOString()
        : null;
      await adminApi(`/sponsors/${id}/boosts`, {
        method: "POST",
        body: JSON.stringify({
          eventId: eventId.trim(),
          boostWeight: 1,
          sponsorEndsAt: ends,
        }),
      });
      setEventId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Boost failed");
    }
  }

  async function clearBoost(eventIdToClear: string) {
    try {
      await adminApi(`/sponsors/${id}/boosts/${eventIdToClear}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    }
  }

  if (!sponsor && !error) return <p className="admin-muted">Loading…</p>;
  if (!sponsor) return <p className="admin-error">{error}</p>;

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <div>
          <Link href="/admin/sponsors" className="admin-muted">
            ← Sponsors
          </Link>
          <h1>{sponsor.name}</h1>
          <p className="admin-muted">
            {sponsor.package} · {sponsor.metro}
            {outboundTotal != null
              ? ` · ${outboundTotal} outbound clicks (30d)`
              : ""}
          </p>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}

      <form className="admin-form admin-two-col" onSubmit={saveSponsor}>
        <label>
          Name
          <input
            value={sponsor.name}
            onChange={(e) => setSponsor({ ...sponsor, name: e.target.value })}
          />
        </label>
        <label>
          Metro
          <select
            value={sponsor.metro}
            onChange={(e) => setSponsor({ ...sponsor, metro: e.target.value })}
          >
            <option value="sf">sf</option>
            <option value="bay">bay</option>
            <option value="chicago">chicago</option>
          </select>
        </label>
        <label>
          Package
          <select
            value={sponsor.package}
            onChange={(e) =>
              setSponsor({ ...sponsor, package: e.target.value })
            }
          >
            <option value="venue_boost">venue_boost</option>
            <option value="happy_hour">happy_hour</option>
            <option value="festival">festival</option>
          </select>
        </label>
        <label>
          Contact email
          <input
            type="email"
            value={sponsor.contactEmail ?? ""}
            onChange={(e) =>
              setSponsor({
                ...sponsor,
                contactEmail: e.target.value || null,
              })
            }
          />
        </label>
        <label className="full">
          Notes
          <textarea
            rows={3}
            value={sponsor.notes ?? ""}
            onChange={(e) =>
              setSponsor({ ...sponsor, notes: e.target.value || null })
            }
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={sponsor.active}
            onChange={(e) =>
              setSponsor({ ...sponsor, active: e.target.checked })
            }
          />
          Active
        </label>
        <div className="full">
          <button type="submit" className="admin-btn">
            Save sponsor
          </button>
        </div>
      </form>

      <section className="admin-section">
        <h2>Attach listing boost</h2>
        <div className="admin-filters">
          <input
            placeholder="Event UUID"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          />
          <button
            type="button"
            className="admin-btn"
            onClick={() => void attachBoost(false)}
          >
            Boost
          </button>
          <button
            type="button"
            className="admin-btn ghost"
            onClick={() => void attachBoost(true)}
          >
            2-week trial
          </button>
        </div>
      </section>

      <section className="admin-section">
        <h2>Boosted events</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Weight</th>
              <th>Ends</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td>
                  <Link href={`/admin/listings/${ev.id}`}>{ev.title}</Link>
                  {!ev.isSponsored ? (
                    <span className="admin-chip muted">flag off</span>
                  ) : null}
                </td>
                <td>{ev.boostWeight}</td>
                <td>
                  {ev.sponsorEndsAt
                    ? new Date(ev.sponsorEndsAt).toLocaleString()
                    : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className="admin-btn small ghost"
                    onClick={() => void clearBoost(ev.id)}
                  >
                    Clear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
