"use client";

import type { ReactNode } from "react";
import type { FeedView } from "@/lib/feed-prefs";

const OPTIONS: {
  id: FeedView;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: "large",
    label: "Larger cards",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2" width="6.5" height="12" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M10 4.5h4.5M10 8h4.5M10 11.5h3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "poster",
    label: "Poster cards",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="2" y="1.5" width="12" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M4 11.5h8M4 13.2h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "by_time",
    label: "By time",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          d="M2.5 3.5h11M2.5 8h11M2.5 12.5h8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "reels",
    label: "Reels & shorts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect
          x="4.5"
          y="1.5"
          width="7"
          height="13"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M7.5 6.5l3 1.75-3 1.75V6.5z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    ),
  },
];

export function FeedViewToggle({
  value,
  onChange,
  views,
  ariaLabel = "Feed layout",
}: {
  value: FeedView;
  onChange: (view: FeedView) => void;
  /** Subset of layouts (e.g. Saved reels: reels + larger cards). */
  views?: readonly FeedView[];
  ariaLabel?: string;
}) {
  const options = views?.length
    ? views
        .map((id) => OPTIONS.find((o) => o.id === id))
        .filter((o): o is (typeof OPTIONS)[number] => Boolean(o))
    : OPTIONS;

  return (
    <div className="feed-view-toggle" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`feed-view-toggle__btn ${value === opt.id ? "is-active" : ""}`}
          aria-label={opt.label}
          aria-pressed={value === opt.id}
          title={opt.label}
          onClick={() => onChange(opt.id)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
