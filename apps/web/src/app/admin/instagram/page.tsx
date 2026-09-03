"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { adminApi } from "../../../lib/admin-api";

type IgFeedCity = "sf" | "chicago" | "la";

type ScrapeStatus = {
  lastScrapedAt: string | null;
  lastOk: boolean | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  mediaFetched: number;
  eventsEmitted: number;
  profilePictureUrl: string | null;
};

type Creator = {
  handle: string;
  city: IgFeedCity;
  categories: string[];
  foodInfluencer?: boolean;
  cityGuide?: boolean;
  localOutlet?: boolean;
  id: string | null;
  source: "seed" | "admin";
  active: boolean;
  notes: string | null;
  updatedAt: string | null;
  listingCount: number;
  profilePictureUrl: string | null;
  scrape: ScrapeStatus;
};

type LookupProfile = {
  handle: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
  alreadyScraped: boolean;
  scrapedCity: IgFeedCity | null;
};

const CITY_LABEL: Record<IgFeedCity, string> = {
  sf: "San Francisco / Bay",
  chicago: "Chicago",
  la: "Los Angeles",
};

function fmtFollowers(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtScrape(c: Creator): { label: string; title: string } {
  const s = c.scrape;
  if (s.lastOk === false) {
    return {
      label: s.lastHttpStatus ? `Fail ${s.lastHttpStatus}` : "Fail",
      title: s.lastError ?? "Last scrape failed",
    };
  }
  if (s.lastScrapedAt && s.lastOk && (s.mediaFetched > 0 || s.eventsEmitted > 0)) {
    const when = new Date(s.lastScrapedAt).toLocaleString();
    return {
      label: `${s.eventsEmitted}/${s.mediaFetched}`,
      title: `Last OK ${when} · ${s.mediaFetched} media → ${s.eventsEmitted} listings emitted`,
    };
  }
  if (c.listingCount > 0) {
    return { label: "—", title: "No scrape status yet (has older listings)" };
  }
  return { label: "—", title: "Not scraped yet" };
}

function CreatorAvatar({
  url,
  handle,
  size = 36,
}: {
  url: string | null;
  handle: string;
  size?: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="admin-ig-list-avatar"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className="admin-ig-list-avatar admin-ig-list-avatar--empty"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {handle.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AdminIgCreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [cities, setCities] = useState<IgFeedCity[]>(["sf", "chicago", "la"]);
  const [totals, setTotals] = useState({ all: 0, active: 0, admin: 0 });
  const [filterCity, setFilterCity] = useState<IgFeedCity | "all">("sf");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<LookupProfile | null>(null);
  const [addCity, setAddCity] = useState<IgFeedCity>("sf");
  const [foodInfluencer, setFoodInfluencer] = useState(true);
  const [cityGuide, setCityGuide] = useState(false);
  const [localOutlet, setLocalOutlet] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminApi<{
        creators: Creator[];
        cities: IgFeedCity[];
        totals: { all: number; active: number; admin: number };
      }>("/instagram/creators");
      setCreators(data.creators);
      setCities(data.cities);
      setTotals(data.totals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deadCount = useMemo(
    () =>
      creators.filter((c) => {
        if (!c.active) return false;
        if (c.scrape.lastOk === false) return true;
        return (
          c.scrape.lastScrapedAt == null &&
          c.listingCount === 0 &&
          !c.profilePictureUrl
        );
      }).length,
    [creators],
  );

  const visible = useMemo(() => {
    return creators.filter((c) => {
      if (filterCity !== "all" && c.city !== filterCity) return false;
      if (!showInactive && !c.active) return false;
      return true;
    });
  }, [creators, filterCity, showInactive]);

  const grouped = useMemo(() => {
    const map = new Map<IgFeedCity, Creator[]>();
    for (const city of cities) map.set(city, []);
    for (const c of visible) {
      const list = map.get(c.city) ?? [];
      list.push(c);
      map.set(c.city, list);
    }
    return map;
  }, [visible, cities]);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy("lookup");
    setLookup(null);
    setNote(null);
    try {
      const data = await adminApi<{ profile: LookupProfile }>(
        `/instagram/creators/lookup?handle=${encodeURIComponent(query)}`,
      );
      setLookup(data.profile);
      if (data.profile.scrapedCity) setAddCity(data.profile.scrapedCity);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function addCreator() {
    if (!lookup) return;
    setBusy("add");
    setNote(null);
    try {
      await adminApi("/instagram/creators", {
        method: "POST",
        body: JSON.stringify({
          handle: lookup.handle,
          city: addCity,
          foodInfluencer,
          cityGuide,
          localOutlet,
          active: true,
          categories: ["food"],
          profilePictureUrl: lookup.profilePictureUrl,
        }),
      });
      setNote(`Added @${lookup.handle} to ${CITY_LABEL[addCity]} scrape list.`);
      setLookup(null);
      setQuery("");
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(c: Creator) {
    setBusy(c.handle);
    try {
      await adminApi(`/instagram/creators/${encodeURIComponent(c.handle)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeCreator(c: Creator) {
    if (c.source !== "admin") return;
    if (!window.confirm(`Remove @${c.handle} from scrape list?`)) return;
    setBusy(c.handle);
    try {
      await adminApi(`/instagram/creators/${encodeURIComponent(c.handle)}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(null);
    }
  }

  async function pruneDead() {
    if (
      !window.confirm(
        `Disable ${deadCount || "all"} dead handle(s)? Failed scrapes and never-scraped zero-listing accounts will be disabled.`,
      )
    ) {
      return;
    }
    setBusy("prune");
    setNote(null);
    try {
      const result = await adminApi<{ pruned: string[]; skipped: number }>(
        "/instagram/creators/prune-dead",
        { method: "POST", body: JSON.stringify({}) },
      );
      setNote(
        result.pruned.length
          ? `Disabled ${result.pruned.length}: ${result.pruned.map((h) => `@${h}`).join(", ")}`
          : "Nothing to prune.",
      );
      setShowInactive(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prune failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="admin-muted">
        Handles scraped per metro via Instagram Graph business discovery. Seed
        list ships in code; admin additions live in the DB and are picked up on
        the next Instagram ingest.
      </p>

      {error ? <p className="admin-error">{error}</p> : null}
      {note ? <p className="admin-ok">{note}</p> : null}

      <div className="admin-stat-strip">
        <div>
          <strong>{totals.active}</strong>
          <span>Active</span>
        </div>
        <div>
          <strong>{totals.all}</strong>
          <span>Total</span>
        </div>
        <div>
          <strong>{totals.admin}</strong>
          <span>Admin-added</span>
        </div>
        <div>
          <strong>{deadCount}</strong>
          <span>Likely dead</span>
        </div>
      </div>

      <section className="admin-section">
        <h2>Find creator</h2>
        <form className="admin-ig-search" onSubmit={(e) => void search(e)}>
          <input
            className="admin-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@handle"
            aria-label="Instagram handle"
          />
          <button
            type="submit"
            className="admin-btn"
            disabled={busy === "lookup" || !query.trim()}
          >
            {busy === "lookup" ? "Searching…" : "Look up"}
          </button>
        </form>

        {lookup ? (
          <div className="admin-ig-profile">
            {lookup.profilePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lookup.profilePictureUrl}
                alt=""
                className="admin-ig-profile__avatar"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="admin-ig-profile__avatar admin-ig-profile__avatar--empty" />
            )}
            <div className="admin-ig-profile__body">
              <p className="admin-ig-profile__handle">@{lookup.handle}</p>
              {lookup.name ? (
                <p className="admin-ig-profile__name">{lookup.name}</p>
              ) : null}
              <p className="admin-muted">
                {fmtFollowers(lookup.followersCount)} followers ·{" "}
                {lookup.mediaCount ?? "—"} posts
                {lookup.alreadyScraped
                  ? ` · already scraping (${lookup.scrapedCity})`
                  : null}
              </p>
              {lookup.biography ? (
                <p className="admin-ig-profile__bio">{lookup.biography}</p>
              ) : null}

              <div className="admin-ig-add">
                <label>
                  Metro
                  <select
                    className="admin-input"
                    value={addCity}
                    onChange={(e) => setAddCity(e.target.value as IgFeedCity)}
                  >
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {CITY_LABEL[city]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={foodInfluencer}
                    onChange={(e) => setFoodInfluencer(e.target.checked)}
                  />
                  Food influencer
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={cityGuide}
                    onChange={(e) => setCityGuide(e.target.checked)}
                  />
                  City guide
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={localOutlet}
                    onChange={(e) => setLocalOutlet(e.target.checked)}
                  />
                  Local outlet
                </label>
                <button
                  type="button"
                  className="admin-btn"
                  disabled={busy === "add"}
                  onClick={() => void addCreator()}
                >
                  {lookup.alreadyScraped ? "Update & enable" : "Add to scrape list"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="admin-section">
        <div className="admin-card-head">
          <h2>Scrape list</h2>
          <div className="admin-row-actions">
            <select
              className="admin-input"
              value={filterCity}
              onChange={(e) =>
                setFilterCity(e.target.value as IgFeedCity | "all")
              }
              aria-label="Filter by city"
            >
              <option value="all">All metros</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {CITY_LABEL[city]}
                </option>
              ))}
            </select>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show disabled
            </label>
            <button
              type="button"
              className="admin-btn ghost"
              disabled={busy === "prune" || deadCount === 0}
              onClick={() => void pruneDead()}
            >
              {busy === "prune" ? "Pruning…" : `Prune dead (${deadCount})`}
            </button>
            <button
              type="button"
              className="admin-btn ghost"
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>
        </div>

        {[...grouped.entries()].map(([city, list]) => {
          if (filterCity !== "all" && city !== filterCity) return null;
          if (list.length === 0) return null;
          return (
            <div key={city} className="admin-ig-city">
              <h3>
                {CITY_LABEL[city]}{" "}
                <span className="admin-muted">({list.length})</span>
              </h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Handle</th>
                      <th>Type</th>
                      <th>Listings</th>
                      <th>Last scrape</th>
                      <th>Source</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => {
                      const scrape = fmtScrape(c);
                      return (
                        <tr
                          key={`${c.city}:${c.handle}`}
                          className={c.active ? undefined : "is-muted"}
                        >
                          <td>
                            <div className="admin-ig-handle-cell">
                              <CreatorAvatar
                                url={c.profilePictureUrl}
                                handle={c.handle}
                              />
                              <a
                                href={`https://instagram.com/${c.handle}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                @{c.handle}
                              </a>
                            </div>
                          </td>
                          <td className="admin-muted">
                            {[
                              c.foodInfluencer ? "influencer" : null,
                              c.cityGuide ? "guide" : null,
                              c.localOutlet ? "outlet" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td>{c.listingCount}</td>
                          <td
                            className={
                              c.scrape.lastOk === false
                                ? "admin-error"
                                : "admin-muted"
                            }
                            title={scrape.title}
                          >
                            {scrape.label}
                          </td>
                          <td>{c.source}</td>
                          <td className="admin-row-actions">
                            <button
                              type="button"
                              className="admin-btn small ghost"
                              disabled={busy === c.handle}
                              onClick={() => void toggleActive(c)}
                            >
                              {c.active ? "Disable" : "Enable"}
                            </button>
                            {c.source === "admin" ? (
                              <button
                                type="button"
                                className="admin-btn small ghost"
                                disabled={busy === c.handle}
                                onClick={() => void removeCreator(c)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
