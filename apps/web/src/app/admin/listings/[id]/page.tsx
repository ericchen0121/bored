"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../../../../lib/admin-api";
import { API_URL } from "../../../../lib/api";

type EventDetail = {
  id: string;
  source: string;
  sourceEventId: string;
  kind: string;
  title: string;
  description: string | null;
  startsAt: string;
  city: string;
  neighborhood: string | null;
  url: string | null;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
  isSponsored: boolean;
  sponsorId: string | null;
  boostWeight: number;
  sponsorEndsAt: string | null;
  hidden: boolean;
  lastSeenAt: string;
  contentHash: string;
  rawPayload: unknown;
};

type Sponsor = {
  id: string;
  name: string;
  metro: string;
  package: string;
  active: boolean;
};

export default function AdminListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [interestCats, setInterestCats] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, sp] = await Promise.all([
        adminApi<{
          event: EventDetail;
          taxonomy: { interestCategories: string[] };
        }>(`/events/${id}`),
        adminApi<{ sponsors: Sponsor[] }>("/sponsors?active=1"),
      ]);
      setEvent(data.event);
      setCategories(data.event.categories ?? []);
      setTagsText((data.event.tags ?? []).join(", "));
      setInterestCats(data.taxonomy.interestCategories);
      setSponsors(sp.sponsors);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setBusy(true);
    setSaved(false);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { event: updated } = await adminApi<{ event: EventDetail }>(
        `/events/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: event.title,
            description: event.description,
            categories,
            tags,
            imageUrl: event.imageUrl,
            url: event.url,
            neighborhood: event.neighborhood,
            hidden: event.hidden,
            isSponsored: event.isSponsored,
            sponsorId: event.sponsorId,
            boostWeight: event.boostWeight,
            sponsorEndsAt: event.sponsorEndsAt,
          }),
        },
      );
      setEvent(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  if (!event && !error) {
    return <p className="admin-muted">Loading…</p>;
  }
  if (!event) {
    return <p className="admin-error">{error}</p>;
  }

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <div>
          <Link href="/admin/listings" className="admin-muted">
            ← Listings
          </Link>
          <h1>{event.title}</h1>
          <p className="admin-muted">
            {event.source} · {event.city} · {event.id}
          </p>
        </div>
        <div className="admin-actions">
          <a
            className="admin-btn ghost"
            href={`/events/${event.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Public detail
          </a>
          <a
            className="admin-btn ghost"
            href={`${API_URL}/r/e/${event.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Outbound /r
          </a>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {saved ? <p className="admin-ok">Saved</p> : null}

      <form className="admin-form admin-two-col" onSubmit={save}>
        <label>
          Title
          <input
            value={event.title}
            onChange={(e) => setEvent({ ...event, title: e.target.value })}
          />
        </label>
        <label>
          Neighborhood
          <input
            value={event.neighborhood ?? ""}
            onChange={(e) =>
              setEvent({ ...event, neighborhood: e.target.value || null })
            }
          />
        </label>
        <label className="full">
          Description
          <textarea
            rows={5}
            value={event.description ?? ""}
            onChange={(e) =>
              setEvent({ ...event, description: e.target.value || null })
            }
          />
        </label>
        <label>
          Image URL
          <input
            value={event.imageUrl ?? ""}
            onChange={(e) =>
              setEvent({ ...event, imageUrl: e.target.value || null })
            }
          />
        </label>
        <label>
          URL
          <input
            value={event.url ?? ""}
            onChange={(e) =>
              setEvent({ ...event, url: e.target.value || null })
            }
          />
        </label>
        <label className="full">
          Tags (comma-separated)
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </label>
        <fieldset className="full">
          <legend>Categories</legend>
          <div className="admin-chip-row">
            {interestCats.map((cat) => (
              <button
                key={cat}
                type="button"
                className={
                  categories.includes(cat) ? "admin-chip on" : "admin-chip"
                }
                onClick={() => toggleCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="full admin-fieldset">
          <legend>Visibility & boost</legend>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={event.hidden}
              onChange={(e) =>
                setEvent({ ...event, hidden: e.target.checked })
              }
            />
            Hidden from public feed
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={event.isSponsored}
              onChange={(e) =>
                setEvent({ ...event, isSponsored: e.target.checked })
              }
            />
            Sponsored
          </label>
          <label>
            Sponsor
            <select
              value={event.sponsorId ?? ""}
              onChange={(e) =>
                setEvent({
                  ...event,
                  sponsorId: e.target.value || null,
                  isSponsored: e.target.value
                    ? true
                    : event.isSponsored,
                })
              }
            >
              <option value="">—</option>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.package})
                </option>
              ))}
            </select>
          </label>
          <label>
            Boost weight
            <input
              type="number"
              step="0.1"
              value={event.boostWeight}
              onChange={(e) =>
                setEvent({
                  ...event,
                  boostWeight: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label>
            Sponsor ends at
            <input
              type="datetime-local"
              value={
                event.sponsorEndsAt
                  ? new Date(event.sponsorEndsAt).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                setEvent({
                  ...event,
                  sponsorEndsAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
        </fieldset>

        <div className="full admin-actions">
          <button type="submit" className="admin-btn" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt=""
          className="admin-preview-img"
        />
      ) : null}

      <section className="admin-section">
        <h2>rawPayload</h2>
        <pre className="admin-pre">
          {JSON.stringify(event.rawPayload, null, 2)}
        </pre>
        <p className="admin-muted">
          lastSeenAt {new Date(event.lastSeenAt).toLocaleString()} · contentHash{" "}
          {event.contentHash}
        </p>
      </section>
    </div>
  );
}
