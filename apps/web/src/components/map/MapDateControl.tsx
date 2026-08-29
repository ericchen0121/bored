"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { FeedMode } from "@bored/shared";
import { dayKey } from "@/lib/datetime";
import {
  calendarGridDays,
  compareDateKeys,
  monthLabel,
  monthStartKey,
} from "@/lib/feed-calendar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type PopoverPos = { top: number; left: number; width: number };

function Chevron({ direction }: { direction: "left" | "right" | "down" }) {
  const d =
    direction === "left"
      ? "M15 6l-6 6 6 6"
      : direction === "right"
        ? "M9 6l6 6-6 6"
        : "M6 9l6 6 6-6";
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** e.g. "Friday, Aug 28" in the city timezone. */
export function formatMapDateLine(
  yyyyMmDd: string,
  timeZone: string,
): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const noon = new Date(Date.UTC(y!, m! - 1, d!, 12));
  return noon.toLocaleDateString("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function mapDateControlLabel(
  mode: FeedMode,
  date: string | null,
  timeZone: string,
): string {
  const today = dayKey(new Date(), timeZone);
  if (mode === "weekend" && !date) return "Weekend";
  const effective =
    mode === "today" ? (date ?? today) : date;
  if (!effective) {
    if (mode === "weekend") return "Weekend";
    return "Select date";
  }
  const line = formatMapDateLine(effective, timeZone);
  if (effective === today) return `Today / ${line}`;
  if (mode === "weekend") return `Weekend / ${line}`;
  return line;
}

export function MapDateControl({
  mode,
  date,
  timeZone,
  daysWithEvents,
  minDate,
  maxDate,
  onSelectToday,
  onSelectWeekend,
  onSelectDate,
}: {
  mode: FeedMode;
  date: string | null;
  timeZone: string;
  daysWithEvents: Set<string>;
  minDate: string;
  maxDate: string;
  onSelectToday: () => void;
  onSelectWeekend: () => void;
  onSelectDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const today = dayKey(new Date(), timeZone);
  const [viewMonth, setViewMonth] = useState(() =>
    monthStartKey(date ?? today),
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const label = mapDateControlLabel(mode, date, timeZone);
  const todayActive = mode === "today";
  const weekendActive = mode === "weekend" && !date;
  const dateActive = mode === "date" || (mode === "weekend" && Boolean(date));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setShowCalendar(false);
      return;
    }
    setViewMonth(monthStartKey(date ?? today));
    if (dateActive) setShowCalendar(true);
  }, [open, date, today, dateActive]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(showCalendar ? 320 : 260, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        window.innerWidth - width - 12,
      );
      const estimatedHeight = showCalendar ? 420 : 200;
      const below = rect.bottom + 8;
      const top =
        below + estimatedHeight > window.innerHeight - 12
          ? Math.max(12, rect.top - estimatedHeight - 8)
          : below;
      setPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, showCalendar]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const [y, m] = viewMonth.split("-").map(Number);
  const viewMonthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const minMonth = monthStartKey(minDate);
  const maxMonth = monthStartKey(maxDate);
  const canPrev = compareDateKeys(viewMonthStart, minMonth) > 0;
  const canNext = compareDateKeys(viewMonthStart, maxMonth) < 0;

  const prevMonth = () => {
    if (!canPrev) return;
    if (m === 1) setViewMonth(`${y! - 1}-12-01`);
    else setViewMonth(`${y}-${String(m! - 1).padStart(2, "0")}-01`);
  };

  const nextMonth = () => {
    if (!canNext) return;
    if (m === 12) setViewMonth(`${y! + 1}-01-01`);
    else setViewMonth(`${y}-${String(m! + 1).padStart(2, "0")}-01`);
  };

  const cells = calendarGridDays(viewMonthStart);

  const popover =
    open && mounted && pos
      ? createPortal(
          <>
            <button
              type="button"
              className="map-date__scrim"
              aria-label="Close date menu"
              onClick={() => setOpen(false)}
            />
            <div
              ref={popoverRef}
              id={dialogId}
              className="map-date__popover"
              role="dialog"
              aria-modal="true"
              aria-label="Choose map dates"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
            >
              <div className="map-date__options" role="listbox">
                <button
                  type="button"
                  role="option"
                  aria-selected={todayActive}
                  className={`map-date__option ${todayActive ? "is-active" : ""}`}
                  onClick={() => {
                    onSelectToday();
                    setOpen(false);
                  }}
                >
                  <span className="map-date__option-title">Today</span>
                  <span className="map-date__option-meta">
                    {formatMapDateLine(today, timeZone)}
                  </span>
                </button>
                <button
                  type="button"
                  role="option"
                  aria-selected={weekendActive}
                  className={`map-date__option ${weekendActive ? "is-active" : ""}`}
                  onClick={() => {
                    onSelectWeekend();
                    setOpen(false);
                  }}
                >
                  <span className="map-date__option-title">Weekend</span>
                  <span className="map-date__option-meta">
                    Fri–Sun coming up
                  </span>
                </button>
                <button
                  type="button"
                  role="option"
                  aria-selected={dateActive && showCalendar}
                  className={`map-date__option ${dateActive ? "is-active" : ""}`}
                  onClick={() => setShowCalendar(true)}
                >
                  <span className="map-date__option-title">By date</span>
                  <span className="map-date__option-meta">
                    Pick a day on the calendar
                  </span>
                </button>
              </div>

              {showCalendar && (
                <div className="map-date__calendar">
                  <div className="day-calendar__header">
                    <p className="day-calendar__title">
                      {monthLabel(viewMonthStart, timeZone)}
                    </p>
                    <div className="day-calendar__nav-group">
                      <button
                        type="button"
                        className="day-calendar__nav"
                        onClick={prevMonth}
                        disabled={!canPrev}
                        aria-label="Previous month"
                      >
                        <Chevron direction="left" />
                      </button>
                      <button
                        type="button"
                        className="day-calendar__nav"
                        onClick={nextMonth}
                        disabled={!canNext}
                        aria-label="Next month"
                      >
                        <Chevron direction="right" />
                      </button>
                    </div>
                  </div>

                  <div className="day-calendar__weekdays" aria-hidden>
                    {WEEKDAYS.map((d, i) => (
                      <span key={`${d}-${i}`}>{d}</span>
                    ))}
                  </div>

                  <div className="day-calendar__grid" role="grid">
                    {cells.map((key, i) => {
                      if (!key) {
                        return (
                          <span
                            key={`pad-${i}`}
                            className="day-calendar__cell is-empty"
                            aria-hidden
                          />
                        );
                      }
                      const outOfRange =
                        compareDateKeys(key, minDate) < 0 ||
                        compareDateKeys(key, maxDate) > 0;
                      const hasEvents = daysWithEvents.has(key);
                      const isSelected = date === key && dateActive;
                      const isToday = key === today;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="gridcell"
                          disabled={outOfRange}
                          className={[
                            "day-calendar__cell",
                            isSelected ? "is-selected" : "",
                            isToday ? "is-today" : "",
                            hasEvents ? "has-events" : "",
                            outOfRange ? "is-disabled" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            onSelectDate(key);
                            setOpen(false);
                          }}
                        >
                          {Number(key.slice(-2))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="map-date__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="map-date__label">{label}</span>
        <Chevron direction="down" />
      </button>
      {popover}
    </>
  );
}
