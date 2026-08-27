"use client";

import type { ReactNode } from "react";
import type { FeedView } from "@/lib/feed-prefs";

const OPTIONS: {
  id: FeedView;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: "cards",
    label: "Standard cards",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9.5" y="2.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="1.5" y="8.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9.5" y="8.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
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
    id: "list",
    label: "Text list",
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
];

export function FeedViewToggle({
  value,
  onChange,
}: {
  value: FeedView;
  onChange: (view: FeedView) => void;
}) {
  return (
    <div className="feed-view-toggle" role="group" aria-label="Feed layout">
      {OPTIONS.map((opt) => (
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
