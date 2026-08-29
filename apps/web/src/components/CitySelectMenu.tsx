"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  FEED_CITIES,
  FEED_CITY_LABELS,
  type FeedArea,
  type FeedCity,
} from "@bored/shared";
import { requestFeedAreaFromLocation } from "@/lib/detect-city";

type LocState = "idle" | "loading" | "error";

export function CitySelectMenu({
  city,
  onSelectCity,
  onSelectArea,
}: {
  city: FeedCity;
  onSelectCity: (next: FeedCity) => void;
  onSelectArea: (area: FeedArea) => void;
}) {
  const [open, setOpen] = useState(false);
  const [locState, setLocState] = useState<LocState>("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

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

  useEffect(() => {
    if (!open) setLocState("idle");
  }, [open]);

  async function useLocation() {
    setLocState("loading");
    try {
      const area = await requestFeedAreaFromLocation();
      onSelectArea(area);
      setOpen(false);
      setLocState("idle");
    } catch {
      setLocState("error");
    }
  }

  return (
    <div className={`city-menu ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="city-menu__trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="city-menu__trigger-label">{FEED_CITY_LABELS[city]}</span>
        <span className="city-menu__chevron" aria-hidden>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M1 1l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div className="city-menu__panel" role="presentation">
          <div className="city-menu__glow" aria-hidden />
          <button
            type="button"
            className={`city-menu__locate ${locState === "loading" ? "is-loading" : ""} ${locState === "error" ? "is-error" : ""}`}
            onClick={() => void useLocation()}
            disabled={locState === "loading"}
          >
            <span className="city-menu__locate-icon" aria-hidden>
              <span className="city-menu__locate-pulse" />
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="2.25"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="city-menu__locate-copy">
              <span className="city-menu__locate-title">
                {locState === "loading"
                  ? "Finding you…"
                  : locState === "error"
                    ? "Location unavailable"
                    : "Use your location"}
              </span>
              <span className="city-menu__locate-sub">
                {locState === "error"
                  ? "Pick a city below"
                  : "Nearest metro feed"}
              </span>
            </span>
          </button>

          <div className="city-menu__divider" aria-hidden>
            <span>Cities</span>
          </div>

          <ul
            id={listboxId}
            className="city-menu__list"
            role="listbox"
            aria-label="City"
          >
            {FEED_CITIES.map((id, i) => {
              const active = id === city;
              return (
                <li
                  key={id}
                  role="presentation"
                  style={{ "--i": i } as CSSProperties}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`city-menu__option ${active ? "is-active" : ""}`}
                    onClick={() => {
                      onSelectCity(id);
                      setOpen(false);
                    }}
                  >
                    <span className="city-menu__option-name">
                      {FEED_CITY_LABELS[id]}
                    </span>
                    {active && (
                      <span className="city-menu__check" aria-hidden>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                        >
                          <path
                            d="M2.5 7.2l3 3.3 6-7"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
