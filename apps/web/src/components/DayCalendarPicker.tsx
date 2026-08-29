"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  dayCardLabel,
  dayKey,
} from "@/lib/datetime";
import {
  calendarGridDays,
  compareDateKeys,
  monthLabel,
  monthStartKey,
} from "@/lib/feed-calendar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type PopoverPos = { top: number; left: number; width: number };

export function DayCalendarPicker({
  timeZone,
  selectedDate,
  buttonActive = false,
  daysWithEvents,
  minDate,
  maxDate,
  onSelect,
}: {
  timeZone: string;
  selectedDate: string | null;
  buttonActive?: boolean;
  daysWithEvents: Set<string>;
  minDate: string;
  maxDate: string;
  onSelect: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const [viewMonth, setViewMonth] = useState(() =>
    monthStartKey(selectedDate ?? minDate),
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const today = dayKey(new Date(), timeZone);
  const pickerActive = buttonActive && selectedDate != null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setViewMonth(monthStartKey(selectedDate ?? minDate));
  }, [open, selectedDate, minDate]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const place = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12,
      );
      const estimatedHeight = 360;
      const below = rect.bottom + 10;
      const top =
        below + estimatedHeight > window.innerHeight - 12
          ? Math.max(12, rect.top - estimatedHeight - 10)
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
  }, [open]);

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
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const viewMonthStart = monthStartKey(viewMonth);
  const minMonth = monthStartKey(minDate);
  const maxMonth = monthStartKey(maxDate);
  const canPrev = compareDateKeys(viewMonthStart, minMonth) > 0;
  const canNext = compareDateKeys(viewMonthStart, maxMonth) < 0;

  const prevMonth = () => {
    if (!canPrev) return;
    const [y, m] = viewMonthStart.split("-").map(Number);
    if (m === 1) setViewMonth(`${y! - 1}-12-01`);
    else setViewMonth(`${y}-${String(m! - 1).padStart(2, "0")}-01`);
  };

  const nextMonth = () => {
    if (!canNext) return;
    const [y, m] = viewMonthStart.split("-").map(Number);
    if (m === 12) setViewMonth(`${y! + 1}-01-01`);
    else setViewMonth(`${y}-${String(m! + 1).padStart(2, "0")}-01`);
  };

  const jumpToday = () => {
    setViewMonth(monthStartKey(today));
    if (compareDateKeys(today, minDate) >= 0 && compareDateKeys(today, maxDate) <= 0) {
      onSelect(today);
      setOpen(false);
    }
  };

  const cells = calendarGridDays(viewMonthStart);

  const popover =
    open && mounted && pos
      ? createPortal(
          <>
            <button
              type="button"
              className="day-calendar__scrim"
              aria-label="Close calendar"
              onClick={() => setOpen(false)}
            />
            <div
              ref={popoverRef}
              id={dialogId}
              className="day-calendar__popover"
              role="dialog"
              aria-modal="true"
              aria-label="Choose a date"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
            >
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
                  const isSelected = selectedDate === key;
                  const isToday = key === today;

                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      className={[
                        "day-calendar__cell",
                        outOfRange ? "is-disabled" : "",
                        hasEvents ? "has-events" : "",
                        isSelected ? "is-selected" : "",
                        isToday ? "is-today" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={outOfRange}
                      aria-pressed={isSelected}
                      aria-label={
                        hasEvents
                          ? `${dayCardLabel(key, timeZone).weekday} ${dayCardLabel(key, timeZone).dateLine}, has events`
                          : `${dayCardLabel(key, timeZone).weekday} ${dayCardLabel(key, timeZone).dateLine}`
                      }
                      onClick={() => {
                        onSelect(key);
                        setOpen(false);
                      }}
                    >
                      <span className="day-calendar__day">
                        {Number(key.split("-")[2])}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="day-calendar__footer">
                <button
                  type="button"
                  className="day-calendar__today"
                  onClick={jumpToday}
                >
                  Today
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="day-calendar">
      <button
        ref={buttonRef}
        type="button"
        className={`day-card day-card--calendar ${pickerActive && !open ? "active" : ""} ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-label={
          selectedDate && pickerActive
            ? `Calendar, ${dayCardLabel(selectedDate, timeZone).weekday} ${dayCardLabel(selectedDate, timeZone).dateLine} selected`
            : "Open calendar"
        }
      >
        <span className="day-card__weekday" aria-hidden>
          <CalendarIcon />
        </span>
        <span className="day-card__date">
          {selectedDate && pickerActive
            ? dayCardLabel(selectedDate, timeZone).dateLine
            : "More"}
        </span>
      </button>
      {popover}
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d={
          direction === "left"
            ? "M7.5 2.5 4 6l3.5 3.5"
            : "M4.5 2.5 8 6l-3.5 3.5"
        }
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2.5" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
