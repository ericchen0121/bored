"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FeedFilterSource } from "@bored/shared";
import { EVENT_SOURCE_LABELS } from "@bored/shared";

function toggleSource(
  current: FeedFilterSource[],
  id: FeedFilterSource,
): FeedFilterSource[] {
  return current.includes(id)
    ? current.filter((s) => s !== id)
    : [...current, id];
}

export function SourceFilterMenu({
  options,
  selected,
  onChange,
}: {
  options: readonly FeedFilterSource[];
  selected: FeedFilterSource[];
  onChange: (next: FeedFilterSource[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = selected.length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary =
    count === 0
      ? "All sources"
      : count === 1
        ? EVENT_SOURCE_LABELS[selected[0]!]
        : `${count} sources`;

  return (
    <div className={`source-filter ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`source-filter__trigger ${count > 0 ? "is-active" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="source-filter__label">Sources</span>
        <span className="source-filter__summary">{summary}</span>
        <span className="source-filter__chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className="source-filter__panel"
          role="group"
          aria-label="Filter by source"
        >
          <div className="source-filter__panel-head">
            <button
              type="button"
              className={`source-filter__option ${count === 0 ? "is-active" : ""}`}
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              All sources
            </button>
            {count > 0 && (
              <button
                type="button"
                className="source-filter__clear"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="source-filter__options">
            {options.map((id) => {
              const active = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`source-filter__option ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => onChange(toggleSource(selected, id))}
                >
                  {EVENT_SOURCE_LABELS[id]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
