"use client";

import {
  BUDGET_TIERS,
  BUDGET_TIER_HINTS,
  BUDGET_TIER_LABELS,
  INTEREST_CATEGORIES,
  INTEREST_LABELS,
  MUSIC_DANCE_GENRE_CATEGORIES,
  MUSIC_LIVE_GENRE_CATEGORIES,
  defaultAreaForCity,
  defaultNeighborhoodsForCity,
  legacyBudgetMaxToTier,
  locationDefaultForArea,
  metroFromArea,
  neighborhoodsForCity,
  tastesNeighborhoodHint,
  type BudgetTier,
  type FeedCity,
} from "@bored/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  trackOnboardingCompleted,
  trackOnboardingViewed,
} from "@/lib/analytics";
import { feedHomeHref, readFeedPrefs } from "@/lib/feed-prefs";

const MUSIC_GENRE_SET = new Set<string>([
  ...MUSIC_DANCE_GENRE_CATEGORIES,
  ...MUSIC_LIVE_GENRE_CATEGORIES,
]);

/** Coarse interests shown in the main grid (genres have their own sections) */
const CORE_INTERESTS = INTEREST_CATEGORIES.filter(
  (c) => !MUSIC_GENRE_SET.has(c),
);

function resolveOnboardingCity(): FeedCity {
  const prefs = readFeedPrefs();
  return prefs ? metroFromArea(prefs.area) : "sf";
}

export default function OnboardingPage() {
  const router = useRouter();
  const budgetHelpId = useId();
  const [city, setCity] = useState<FeedCity>("sf");
  const [selected, setSelected] = useState<string[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  /** Prefs from other metros — preserved on save so CHI edits don’t wipe SF. */
  const [otherMetroNeighborhoods, setOtherMetroNeighborhoods] = useState<
    string[]
  >([]);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetTier, setBudgetTier] = useState<BudgetTier>(2);
  const [budgetHelpOpen, setBudgetHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const neighborhoodOptions = useMemo(
    () => neighborhoodsForCity(city),
    [city],
  );

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
        budgetEnabled?: boolean;
        budgetTier?: BudgetTier | null;
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
        const tier =
          me.prefs.budgetTier ?? legacyBudgetMaxToTier(me.prefs.budgetMax) ?? 2;
        setBudgetTier(tier);
        setBudgetEnabled(Boolean(me.prefs.budgetEnabled));
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

  const showDanceGenres =
    selected.includes("music.electronic") ||
    selected.includes("nightlife") ||
    selected.some((c) =>
      (MUSIC_DANCE_GENRE_CATEGORIES as readonly string[]).includes(c),
    );

  const showLiveGenres =
    selected.includes("music.live") ||
    selected.some((c) =>
      (MUSIC_LIVE_GENRE_CATEGORIES as readonly string[]).includes(c),
    );

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
          budgetEnabled,
          budgetTier,
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
        budget_enabled: budgetEnabled,
        budget_tier: budgetTier,
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

      {showDanceGenres && (
        <div className="panel">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Dance / electronic
          </h2>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            From 19hz, RA, and similar — boosts house, techno, and friends in
            your feed.
          </p>
          <div className="grid-pills">
            {MUSIC_DANCE_GENRE_CATEGORIES.map((cat) => (
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

      {showLiveGenres && (
        <div className="panel">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Live music styles
          </h2>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            Boosts Ticketmaster and other concerts in these lanes — beyond
            generic “Live music”.
          </p>
          <div className="grid-pills">
            {MUSIC_LIVE_GENRE_CATEGORIES.map((cat) => (
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
          {tastesNeighborhoodHint(city)}
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
        <div className="budget-prefs">
          <div className="budget-prefs__header">
            <h2
              className="section-title"
              style={{ marginTop: 0, marginBottom: 0 }}
            >
              Budget
            </h2>
            <button
              type="button"
              className="budget-prefs__info"
              aria-expanded={budgetHelpOpen}
              aria-controls={budgetHelpId}
              onClick={() => setBudgetHelpOpen((v) => !v)}
            >
              <span aria-hidden>i</span>
              <span className="sr-only">How budget affects the feed</span>
            </button>
          </div>

          {budgetHelpOpen && (
            <p id={budgetHelpId} className="budget-prefs__help muted">
              When filter is on, For you and Weekend hide listings priced above
              your band ($–$$$$). Today and Select Date still show everything.
              Unknown prices and free events always stay. Off = no price
              filtering.
            </p>
          )}

          <div className="budget-prefs__toggle-row">
            <button
              type="button"
              className={`budget-switch${budgetEnabled ? " is-on" : ""}`}
              role="switch"
              aria-checked={budgetEnabled}
              onClick={() => setBudgetEnabled((v) => !v)}
            >
              <span className="budget-switch__track" aria-hidden>
                <span className="budget-switch__thumb" />
              </span>
              <span className="budget-switch__label">
                {budgetEnabled ? "Filter by budget" : "Budget filter off"}
              </span>
            </button>
          </div>

          <div
            className={`budget-prefs__tiers${budgetEnabled ? "" : " is-disabled"}`}
            aria-disabled={!budgetEnabled}
          >
            <p className="muted budget-prefs__tier-hint">
              {budgetEnabled
                ? BUDGET_TIER_HINTS[budgetTier]
                : "Turn on to hide pricier picks in For you"}
            </p>
            <div
              className="grid-pills"
              role="radiogroup"
              aria-label="Budget band"
            >
              {BUDGET_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={budgetTier === tier}
                  className={`pill ${budgetTier === tier ? "on" : ""}`}
                  disabled={!budgetEnabled}
                  onClick={() => setBudgetTier(tier)}
                >
                  {BUDGET_TIER_LABELS[tier]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p
            className="muted"
            style={{ color: "var(--coral)", marginBottom: 12 }}
          >
            {error}
          </p>
        )}
        {savedOk && (
          <p
            className="muted"
            style={{ color: "var(--ok)", marginBottom: 12 }}
          >
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
