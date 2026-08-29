"use client";

import {
  INTEREST_CATEGORIES,
  INTEREST_LABELS,
  MUSIC_GENRE_CATEGORIES,
  defaultAreaForCity,
  defaultNeighborhoodsForCity,
  locationDefaultForArea,
  metroFromArea,
  neighborhoodsForCity,
  type FeedCity,
} from "@bored/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  trackOnboardingCompleted,
  trackOnboardingViewed,
} from "@/lib/analytics";
import { feedHomeHref, readFeedPrefs } from "@/lib/feed-prefs";

const MUSIC_GENRE_SET = new Set<string>(MUSIC_GENRE_CATEGORIES);

/** Coarse interests shown in the main grid (genres have their own section) */
const CORE_INTERESTS = INTEREST_CATEGORIES.filter(
  (c) => !MUSIC_GENRE_SET.has(c),
);

function resolveOnboardingCity(): FeedCity {
  const prefs = readFeedPrefs();
  return prefs ? metroFromArea(prefs.area) : "sf";
}

export default function OnboardingPage() {
  const router = useRouter();
  const [city, setCity] = useState<FeedCity>("sf");
  const [selected, setSelected] = useState<string[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  /** Prefs from other metros — preserved on save so CHI edits don’t wipe SF. */
  const [otherMetroNeighborhoods, setOtherMetroNeighborhoods] = useState<
    string[]
  >([]);
  const [budgetMax, setBudgetMax] = useState(50);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const neighborhoodOptions = useMemo(
    () => neighborhoodsForCity(city),
    [city],
  );

  const cityLabel = city === "chicago" ? "Chicago" : "SF / Bay";

  useEffect(() => {
    trackOnboardingViewed();
  }, []);

  useEffect(() => {
    const activeCity = resolveOnboardingCity();
    setCity(activeCity);
    const hoodOptions = new Set(neighborhoodsForCity(activeCity));
    const defaults = defaultNeighborhoodsForCity(activeCity);

    void api<{
      prefs: {
        interests: { category: string; weight: number }[];
        neighborhoods: string[];
        budgetMax: number | null;
      };
    }>("/v1/me")
      .then((me) => {
        const cats = me.prefs.interests.map((i) => i.category);
        setSelected(
          cats.length
            ? cats
            : ["music.electronic", "comedy.underground", "movies.arthouse"],
        );
        const kept = me.prefs.neighborhoods.filter((n) => hoodOptions.has(n));
        setOtherMetroNeighborhoods(
          me.prefs.neighborhoods.filter((n) => !hoodOptions.has(n)),
        );
        setNeighborhoods(kept.length ? kept : defaults);
        if (me.prefs.budgetMax != null) setBudgetMax(me.prefs.budgetMax);
      })
      .catch(() => {
        setSelected([
          "music.electronic",
          "comedy.underground",
          "movies.arthouse",
        ]);
        setOtherMetroNeighborhoods([]);
        setNeighborhoods(defaults);
      })
      .finally(() => setLoading(false));
  }, []);

  const interests = useMemo(
    () =>
      INTEREST_CATEGORIES.map((category) => ({
        category,
        weight: selected.includes(category) ? 0.85 : 0,
      })).filter((i) => i.weight > 0),
    [selected],
  );

  const showMusicGenres =
    selected.includes("music.electronic") ||
    selected.includes("nightlife") ||
    selected.some((c) => MUSIC_GENRE_SET.has(c));

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    const loc = locationDefaultForArea(defaultAreaForCity(city));
    try {
      await api("/v1/me/interests", {
        method: "PUT",
        body: JSON.stringify({
          interests,
          neighborhoods: [...otherMetroNeighborhoods, ...neighborhoods],
          budgetMax,
          preferFree: selected.includes("free"),
          nightsOut: true,
          radiusMiles: loc.radiusMiles,
          lat: loc.lat,
          lng: loc.lng,
        }),
      });
      trackOnboardingCompleted({
        city,
        interest_count: interests.length,
        neighborhood_count: neighborhoods.length,
        budget_max: budgetMax,
      });
      setSavedOk(true);
      router.push(feedHomeHref("for_you"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading your tastes…</p>;
  }

  return (
    <>
      <div className="topbar">
        <Link
          href={feedHomeHref("for_you")}
          onClick={(e) => {
            e.preventDefault();
            router.push(feedHomeHref("for_you"));
          }}
        >
          ← Back
        </Link>
      </div>
      <header className="hero">
        <p className="eyebrow">Onboarding</p>
        <h1 className="brand">
          Your <span>tastes</span>
        </h1>
        <p className="lede">
          Pick what you chase — we&apos;ll still slip in adjacent and
          outside-your-usual picks.
        </p>
      </header>

      <div className="panel">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Interests
        </h2>
        <div className="grid-pills">
          {CORE_INTERESTS.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`pill ${selected.includes(cat) ? "on" : ""}`}
              onClick={() => toggle(selected, cat, setSelected)}
            >
              {INTEREST_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {showMusicGenres && (
        <div className="panel">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Music genres
          </h2>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            From 19hz and similar listings — boosts house, techno, and friends
            in your feed.
          </p>
          <div className="grid-pills">
            {MUSIC_GENRE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`pill ${selected.includes(cat) ? "on" : ""}`}
                onClick={() => toggle(selected, cat, setSelected)}
              >
                {INTEREST_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Neighborhoods
        </h2>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          {cityLabel} — switch city on the feed to edit the other metro.
        </p>
        <div className="grid-pills">
          {neighborhoodOptions.map((n) => (
            <button
              key={n}
              type="button"
              className={`pill ${neighborhoods.includes(n) ? "on" : ""}`}
              onClick={() => toggle(neighborhoods, n, setNeighborhoods)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="field">
          <label htmlFor="budget">Budget ceiling ($)</label>
          <input
            id="budget"
            type="number"
            value={budgetMax}
            onChange={(e) => setBudgetMax(Number(e.target.value))}
          />
        </div>
        {error && (
          <p className="muted" style={{ color: "var(--coral)", marginBottom: 12 }}>
            {error}
          </p>
        )}
        {savedOk && (
          <p className="muted" style={{ color: "var(--ok)", marginBottom: 12 }}>
            Saved — loading your feed…
          </p>
        )}
        <button
          type="button"
          className="btn primary"
          onClick={() => void save()}
          disabled={saving || interests.length === 0}
        >
          {saving ? "Saving…" : "Save & show me stuff"}
        </button>
      </div>
    </>
  );
}
