"use client";

import { useMemo } from "react";
import {
  buildWeatherStripSlots,
  type WeatherDay,
  type WeatherHour,
  type WeatherStripSlot,
} from "@/lib/weather";

/** Horizontal Apple Weather–style strip (hours + sunrise/sunset). */
export function HourlyWeatherStrip({
  hours,
  daily = [],
  timeZone,
  className = "",
  label = "Hourly forecast",
}: {
  hours: WeatherHour[];
  daily?: WeatherDay[];
  timeZone: string;
  className?: string;
  label?: string;
}) {
  const slots = useMemo(
    () => buildWeatherStripSlots(hours, daily, timeZone),
    [hours, daily, timeZone],
  );

  if (slots.length === 0) return null;

  return (
    <div
      className={["weather-hourly", className].filter(Boolean).join(" ")}
      aria-label={label}
    >
      <div className="weather-hourly__track">
        {slots.map((slot, i) => (
          <WeatherStripColumn key={slot.key} slot={slot} index={i} />
        ))}
      </div>
    </div>
  );
}

function WeatherStripColumn({
  slot,
  index,
}: {
  slot: WeatherStripSlot;
  index: number;
}) {
  return (
    <div
      className={[
        "weather-hourly__hour",
        slot.kind !== "hour" ? `weather-hourly__hour--${slot.kind}` : "",
        slot.label === "Now" ? "weather-hourly__hour--now" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--weather-chip-i" as string]: String(index) }}
    >
      <span className="weather-hourly__time">{slot.label}</span>
      <span className="weather-hourly__emoji" aria-hidden>
        {slot.emoji}
      </span>
      <span className="weather-hourly__temp">{slot.footer}</span>
    </div>
  );
}
