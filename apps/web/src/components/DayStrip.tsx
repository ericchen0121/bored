"use client";

import { useMemo } from "react";
import { dayCardLabel, upcomingDayKeys } from "@/lib/datetime";
import { isDateInStrip } from "@/lib/feed-calendar";
import { DayCalendarPicker } from "@/components/DayCalendarPicker";

const STRIP_DAY_COUNT = 7;

export function DayStrip({
  timeZone,
  selectedDate,
  daysWithEvents,
  minDate,
  maxDate,
  onSelect,
  highlightWeekend = false,
  showAllDays = true,
  showCalendar = true,
}: {
  timeZone: string;
  selectedDate: string | null;
  daysWithEvents: Set<string>;
  minDate: string;
  maxDate: string;
  onSelect: (date: string | null) => void;
  /** Emphasize Fri / Sat / Sun (Weekend mode). */
  highlightWeekend?: boolean;
  /** Show the “All days” clear button (Select Date). */
  showAllDays?: boolean;
  /** Show the month calendar picker. */
  showCalendar?: boolean;
}) {
  const stripKeys = useMemo(
    () => upcomingDayKeys(timeZone, STRIP_DAY_COUNT),
    [timeZone],
  );

  const days = useMemo(() => {
    return stripKeys.map((key) => dayCardLabel(key, timeZone));
  }, [stripKeys, timeZone]);

  const calendarSelectionActive =
    selectedDate != null && !isDateInStrip(selectedDate, stripKeys);

  return (
    <nav className="day-strip" aria-label="Browse by day">
      {showAllDays && (
        <button
          type="button"
          className={`day-card day-card--all ${selectedDate == null ? "active" : ""}`}
          onClick={() => onSelect(null)}
          aria-pressed={selectedDate == null}
        >
          <span className="day-card__weekday">All</span>
          <span className="day-card__date">days</span>
        </button>
      )}
      {days.map((day) => {
        const active = selectedDate === day.key && !calendarSelectionActive;
        return (
          <button
            key={day.key}
            type="button"
            className={`day-card ${active ? "active" : ""} ${
              day.isToday ? "is-today" : ""
            } ${
              highlightWeekend && day.isWeekend ? "day-card--weekend" : ""
            } ${daysWithEvents.has(day.key) ? "has-events" : ""}`}
            onClick={() => onSelect(active ? null : day.key)}
            aria-pressed={active}
            aria-label={
              day.isToday
                ? `Today, ${day.dateLine}${daysWithEvents.has(day.key) ? ", has events" : ""}`
                : `${day.weekday}, ${day.dateLine}${daysWithEvents.has(day.key) ? ", has events" : ""}`
            }
          >
            <span className="day-card__weekday">
              {day.isToday ? "Today" : day.weekday}
            </span>
            <span className="day-card__date">{day.dateLine}</span>
          </button>
        );
      })}
      {showCalendar && (
        <DayCalendarPicker
          timeZone={timeZone}
          selectedDate={selectedDate}
          buttonActive={calendarSelectionActive}
          daysWithEvents={daysWithEvents}
          minDate={minDate}
          maxDate={maxDate}
          onSelect={(key) => onSelect(key)}
        />
      )}
    </nav>
  );
}
