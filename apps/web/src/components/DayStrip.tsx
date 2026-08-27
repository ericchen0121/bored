"use client";

import { useMemo } from "react";
import { dayCardLabel, upcomingDayKeys } from "@/lib/datetime";

const DAY_COUNT = 14;

export function DayStrip({
  timeZone,
  selectedDate,
  onSelect,
}: {
  timeZone: string;
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}) {
  const days = useMemo(() => {
    return upcomingDayKeys(timeZone, DAY_COUNT).map((key) =>
      dayCardLabel(key, timeZone),
    );
  }, [timeZone]);

  return (
    <nav className="day-strip" aria-label="Browse by day">
      <button
        type="button"
        className={`day-card day-card--all ${selectedDate == null ? "active" : ""}`}
        onClick={() => onSelect(null)}
        aria-pressed={selectedDate == null}
      >
        <span className="day-card__weekday">All</span>
        <span className="day-card__date">days</span>
      </button>
      {days.map((day) => {
        const active = selectedDate === day.key;
        return (
          <button
            key={day.key}
            type="button"
            className={`day-card ${active ? "active" : ""} ${
              day.isToday ? "is-today" : ""
            }`}
            onClick={() => onSelect(active ? null : day.key)}
            aria-pressed={active}
            aria-label={
              day.isToday
                ? `Today, ${day.dateLine}`
                : `${day.weekday}, ${day.dateLine}`
            }
          >
            <span className="day-card__weekday">
              {day.isToday ? "Today" : day.weekday}
            </span>
            <span className="day-card__date">{day.dateLine}</span>
          </button>
        );
      })}
    </nav>
  );
}
