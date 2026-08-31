"use client";

import { FEED_AREAS, INTEREST_CATEGORIES } from "@bored/shared";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { adminApi } from "../../../lib/admin-api";

type DemotionRule = {
  id: string;
  name: string;
  metro: string | null;
  source: string | null;
  venueContains: string | null;
  categoryContains: string | null;
  scoreMultiplier: number;
  maxPerVenue: number | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type SuggestItem = { value: string; count?: number };
type SourceMeta = { id: string; count: number };

type FormState = {
  name: string;
  metro: string;
  source: string;
  venueContains: string;
  categoryContains: string;
  scoreMultiplier: string;
  maxPerVenue: string;
  notes: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  metro: "sf",
  source: "",
  venueContains: "",
  categoryContains: "",
  scoreMultiplier: "0.35",
  maxPerVenue: "1",
  notes: "",
  active: true,
});

function ruleToForm(r: DemotionRule): FormState {
  return {
    name: r.name,
    metro: r.metro ?? "",
    source: r.source ?? "",
    venueContains: r.venueContains ?? "",
    categoryContains: r.categoryContains ?? "",
    scoreMultiplier: String(r.scoreMultiplier),
    maxPerVenue: r.maxPerVenue == null ? "" : String(r.maxPerVenue),
    notes: r.notes ?? "",
    active: r.active,
  };
}

function formPayload(form: FormState) {
  const maxRaw = form.maxPerVenue.trim();
  return {
    name: form.name,
    metro: form.metro || null,
    source: form.source || null,
    venueContains: form.venueContains || null,
    categoryContains: form.categoryContains || null,
    scoreMultiplier: Number(form.scoreMultiplier),
    maxPerVenue: maxRaw === "" ? null : Number(maxRaw),
    notes: form.notes || null,
    active: form.active,
  };
}

function filterOptions(options: SuggestItem[], q: string, limit = 12): SuggestItem[] {
  const needle = q.trim().toLowerCase();
  const ranked = options
    .map((o) => {
      const v = o.value.toLowerCase();
      let score = 0;
      if (!needle) score = 1;
      else if (v === needle) score = 100;
      else if (v.startsWith(needle)) score = 80;
      else if (v.includes(needle)) score = 40;
      else return null;
      return { o, score: score + Math.min(20, o.count ?? 0) / 100 };
    })
    .filter((x): x is { o: SuggestItem; score: number } => x != null)
    .sort((a, b) => b.score - a.score || a.o.value.localeCompare(b.o.value));
  return ranked.slice(0, limit).map((x) => x.o);
}

function SuggestField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  options,
  loadAsync,
  minChars = 0,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Static options (source / category). */
  options?: SuggestItem[];
  /** Async loader (venue). Receives query; return suggestions. */
  loadAsync?: (q: string) => Promise<SuggestItem[]>;
  minChars?: number;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const refresh = useCallback(
    (q: string, show: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      if (q.trim().length < minChars && minChars > 0) {
        setSuggestions([]);
        return;
      }
      timer.current = setTimeout(() => {
        void (async () => {
          try {
            const next = loadAsync
              ? await loadAsync(q)
              : filterOptions(options ?? [], q);
            setSuggestions(next);
            if (show) setOpen(next.length > 0);
          } catch {
            setSuggestions([]);
          }
        })();
      }, loadAsync ? 200 : 0);
    },
    [loadAsync, minChars, options],
  );

  useEffect(() => {
    refresh(value, open);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Only re-filter when value/options change — don't force-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open intentional omit
  }, [value, options, loadAsync, minChars, refresh]);

  return (
    <label className="admin-field">
      <span className="admin-field__label">
        {label}
        {hint ? <span className="admin-field__hint">{hint}</span> : null}
      </span>
      <div className="admin-suggest" ref={wrapRef}>
        <input
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            refresh(value, true);
            setOpen(true);
          }}
        />
        {open && suggestions.length > 0 ? (
          <ul id={listId} className="admin-suggest__list" role="listbox">
            {suggestions.map((s) => (
              <li key={s.value}>
                <button
                  type="button"
                  className="admin-suggest__option"
                  onClick={() => {
                    onChange(s.value);
                    setOpen(false);
                  }}
                >
                  <span>{s.value}</span>
                  {s.count != null ? (
                    <span className="admin-muted">{s.count}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </label>
  );
}

function Field({
  label,
  hint,
  tooltip,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** Instant hover tip (no delay). */
  tooltip?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className ? `admin-field ${className}` : "admin-field"}>
      <span className="admin-field__label">
        {tooltip ? (
          <span className="admin-tip" tabIndex={0}>
            {label}
            <span className="admin-tip__bubble" role="tooltip">
              {tooltip}
            </span>
          </span>
        ) : (
          label
        )}
        {hint ? <span className="admin-field__hint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function AdminSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`admin-switch${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="admin-switch__track" aria-hidden>
        <span className="admin-switch__thumb" />
      </span>
    </button>
  );
}

const MAX_PER_VENUE_TIP =
  "Caps how many matching cards from the same venue can show in the feed (all modes). Leave blank for no cap.";

export default function AdminDemotionsPage() {
  const [rules, setRules] = useState<DemotionRule[]>([]);
  const [feedAreas, setFeedAreas] = useState<string[]>([...FEED_AREAS]);
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [categories, setCategories] = useState<string[]>([
    ...INTEREST_CATEGORIES,
  ]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sourceOptions = useMemo<SuggestItem[]>(
    () => sources.map((s) => ({ value: s.id, count: s.count })),
    [sources],
  );
  const categoryOptions = useMemo<SuggestItem[]>(
    () => categories.map((c) => ({ value: c })),
    [categories],
  );

  const loadVenueSuggest = useCallback(
    async (q: string): Promise<SuggestItem[]> => {
      if (q.trim().length < 2) return [];
      const params = new URLSearchParams({ q, limit: "12" });
      if (form.metro) params.set("metro", form.metro);
      const data = await adminApi<{ venues: { venueName: string; count: number }[] }>(
        `/venues/suggest?${params}`,
      );
      return data.venues.map((v) => ({ value: v.venueName, count: v.count }));
    },
    [form.metro],
  );

  const load = useCallback(async () => {
    try {
      const data = await adminApi<{
        rules: DemotionRule[];
        feedAreas?: string[];
        sources?: SourceMeta[];
        categories?: string[];
      }>("/demotion-rules");
      setRules(data.rules);
      if (data.feedAreas?.length) setFeedAreas(data.feedAreas);
      if (data.sources) setSources(data.sources);
      if (data.categories?.length) setCategories(data.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(rule: DemotionRule) {
    setEditingId(rule.id);
    setForm(ruleToForm(rule));
    setFormOpen(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelForm() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = formPayload(form);
      if (editingId) {
        await adminApi(`/demotion-rules/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await adminApi("/demotion-rules", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rule: DemotionRule) {
    try {
      await adminApi(`/demotion-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !rule.active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(rule: DemotionRule) {
    if (!confirm(`Delete demotion rule “${rule.name}”?`)) return;
    try {
      await adminApi(`/demotion-rules/${rule.id}`, { method: "DELETE" });
      if (editingId === rule.id) cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="admin-stack">
      <div className="admin-page-top">
        <div className="admin-page-head">
          <h1>Feed demotions</h1>
          <div className="admin-actions">
            {!formOpen ? (
              <span className="admin-tip">
                <button
                  type="button"
                  className="admin-btn admin-btn--icon admin-btn--circle"
                  aria-label="Add rule"
                  onClick={openCreate}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <span className="admin-tip__bubble" role="tooltip">
                  Add Rule
                </span>
              </span>
            ) : null}
            <button
              type="button"
              className="admin-btn ghost admin-btn--icon admin-btn--icon-bare"
              aria-expanded={infoOpen}
              aria-label="How demotion rules work"
              onClick={() => setInfoOpen((v) => !v)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <path
                  d="M12 11v5.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="8" r="1.1" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        {infoOpen ? (
          <div className="admin-info-panel">
            <p>
              Matching listings stay in the feed but rank lower and can be capped
              per venue. Metro uses taxonomy feed areas — new cities inherit
              matching automatically.
            </p>
            <ul>
              <li>
                <strong>Source</strong> — exact ingest adapter id (e.g.{" "}
                <code>funcheap</code>). Typeahead lists adapters with listing
                counts.
              </li>
              <li>
                <strong>Venue contains</strong> — case-insensitive substring on{" "}
                <code>venue_name</code> <em>or</em> title (Funcheap often omits
                venue). Suggestions are real venue names from the DB.
              </li>
              <li>
                <strong>Category contains</strong> — substring on any category id
                (pick <code>comedy.showcase</code> or a prefix like{" "}
                <code>comedy</code>). Options are interest categories from
                taxonomy.
              </li>
              <li>
                <strong>Score ×</strong> — multiplies organic score in For you /
                weekend (0.3 ≈ bury). <strong>Max / venue</strong> caps cards from
                that venue in every mode.
              </li>
            </ul>
          </div>
        ) : null}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      {formOpen ? (
        <section className="admin-section">
          <h2>{editingId ? "Edit rule" : "Add rule"}</h2>
          <form className="admin-form admin-demotion-form" onSubmit={(e) => void save(e)}>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Metro" hint="Feed area; blank = all">
              <select
                value={form.metro}
                onChange={(e) => setForm({ ...form, metro: e.target.value })}
              >
                <option value="">any metro</option>
                {feedAreas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>

            <SuggestField
              label="Source"
              hint="Exact adapter id"
              placeholder="e.g. funcheap"
              value={form.source}
              onChange={(source) => setForm({ ...form, source })}
              options={sourceOptions}
            />
            <SuggestField
              label="Venue contains"
              hint="Matches venue name or title"
              placeholder="Type 2+ letters…"
              value={form.venueContains}
              onChange={(venueContains) => setForm({ ...form, venueContains })}
              loadAsync={loadVenueSuggest}
              minChars={2}
            />
            <SuggestField
              label="Category contains"
              hint="Full id or prefix (comedy)"
              placeholder="e.g. comedy.showcase"
              value={form.categoryContains}
              onChange={(categoryContains) =>
                setForm({ ...form, categoryContains })
              }
              options={categoryOptions}
            />

            <Field
              label="Score ×"
              hint="0–1; lower = bury"
            >
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.scoreMultiplier}
                onChange={(e) =>
                  setForm({ ...form, scoreMultiplier: e.target.value })
                }
                required
              />
            </Field>
            <Field
              label="Max / venue"
              hint="Blank = no cap"
              tooltip={MAX_PER_VENUE_TIP}
            >
              <input
                type="number"
                min={0}
                step={1}
                value={form.maxPerVenue}
                onChange={(e) =>
                  setForm({ ...form, maxPerVenue: e.target.value })
                }
              />
            </Field>
            <div className="admin-field admin-field--toggle">
              <span className="admin-field__label">Active</span>
              <AdminSwitch
                checked={form.active}
                label={form.active ? "Active" : "Inactive"}
                onChange={(active) => setForm({ ...form, active })}
              />
            </div>

            <Field label="Notes" className="full">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Why this rule exists…"
              />
            </Field>

            <div className="admin-form-actions full">
              <button type="submit" className="admin-btn" disabled={busy}>
                {editingId ? "Save" : "Create"}
              </button>
              <button
                type="button"
                className="admin-btn ghost"
                onClick={cancelForm}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="admin-section">
        <h2>Rules</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Match</th>
              <th>Score ×</th>
              <th>
                <span className="admin-tip" tabIndex={0}>
                  Max/venue
                  <span className="admin-tip__bubble" role="tooltip">
                    {MAX_PER_VENUE_TIP}
                  </span>
                </span>
              </th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.id}
                className={editingId === r.id ? "admin-row-active" : undefined}
              >
                <td>
                  <div>{r.name}</div>
                  {r.notes ? (
                    <div className="admin-muted">{r.notes}</div>
                  ) : null}
                </td>
                <td className="admin-muted">
                  {[
                    r.metro ? `metro=${r.metro}` : null,
                    r.source ? `source=${r.source}` : null,
                    r.venueContains ? `venue~${r.venueContains}` : null,
                    r.categoryContains
                      ? `category~${r.categoryContains}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td>{r.scoreMultiplier}</td>
                <td>{r.maxPerVenue ?? "—"}</td>
                <td>
                  <AdminSwitch
                    checked={r.active}
                    label={
                      r.active
                        ? `Disable rule ${r.name}`
                        : `Enable rule ${r.name}`
                    }
                    onChange={() => void toggleActive(r)}
                  />
                </td>
                <td className="admin-actions">
                  <button
                    type="button"
                    className="admin-btn small ghost"
                    onClick={() => startEdit(r)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="admin-btn small ghost"
                    onClick={() => void remove(r)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!rules.length ? (
              <tr>
                <td colSpan={6} className="admin-muted">
                  No demotion rules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
