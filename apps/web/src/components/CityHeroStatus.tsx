"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { FeedArea, FeedCity, FeedMode } from "@bored/shared";
import { CityHero } from "@/components/CityHero";
import { HourlyWeatherStrip } from "@/components/HourlyWeatherStrip";
import { WeatherFadeIn, WeatherReveal } from "@/components/WeatherReveal";
import { dayCardLabel, dayKey } from "@/lib/datetime";
import { useWeather } from "@/hooks/useWeather";
import {
  formatWeatherTemp,
  hourlyForDay,
  upcomingHourly,
  weatherCoordsForArea,
  weatherPresentation,
  weatherViewForFeed,
} from "@/lib/weather";

type Props = {
  city: FeedCity;
  area: FeedArea;
  timeZone: string;
  mode: FeedMode;
  selectedDate: string | null;
  children?: ReactNode;
};

function LiveClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time className="city-hero__clock">
      {now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      })}
    </time>
  );
}

function expandLabel(mode: FeedMode, selectedDate: string | null): string {
  const view = weatherViewForFeed(mode, selectedDate);
  if (view === "week") return "More";
  return "Hourly";
}

export function CityHeroStatus({
  city,
  area,
  timeZone,
  mode,
  selectedDate,
  children,
}: Props) {
  const coords = weatherCoordsForArea(area);
  const weather = useWeather(coords.lat, coords.lng, timeZone);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const view = weatherViewForFeed(mode, selectedDate);
  const todayKey = dayKey(new Date(), timeZone);

  const todayDaily = useMemo(() => {
    if (!weather) return null;
    const key = selectedDate && view === "day" ? selectedDate : todayKey;
    return weather.daily.find((d) => d.date === key) ?? weather.daily[0] ?? null;
  }, [weather, selectedDate, view, todayKey]);

  const hourly = useMemo(() => {
    if (!weather) return [];
    if (view === "day" && selectedDate) {
      return hourlyForDay(weather.hourly, selectedDate, timeZone);
    }
    return upcomingHourly(weather.hourly, timeZone);
  }, [weather, view, selectedDate, timeZone]);

  const weekDays = useMemo(() => {
    if (!weather) return [];
    return weather.daily.slice(0, 7);
  }, [weather]);

  useEffect(() => {
    setOpen(false);
  }, [mode, selectedDate]);

  const label = expandLabel(mode, selectedDate);
  const current = weather
    ? weatherPresentation(weather.current.code)
    : null;

  const status = !weather ? (
    <div className="city-hero__status city-hero__status--loading" aria-hidden>
      <span className="city-hero__status-skeleton" />
    </div>
  ) : (
    <WeatherFadeIn
      className="city-hero__status"
      aria-label="Local time and weather"
    >
      <LiveClock timeZone={timeZone} />
      <span className="city-hero__status-weather">
        <span aria-hidden>{current!.emoji}</span>
        {formatWeatherTemp(weather.current.temperatureF)}
        {todayDaily ? (
          <span className="city-hero__status-hl">
            {`H${formatWeatherTemp(todayDaily.highF)} L${formatWeatherTemp(todayDaily.lowF)}`}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="city-hero__status-more"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
    </WeatherFadeIn>
  );

  return (
    <>
      <CityHero city={city} area={area} status={status}>
        {children}
      </CityHero>

      <WeatherReveal
        open={open && Boolean(weather)}
        id={panelId}
        role="region"
        aria-label={label === "More" ? "Weekly forecast" : "Hourly forecast"}
        className="city-hero__weather-below-wrap"
      >
        <div className="city-hero__weather-below">
          {view === "week" ? (
            <div className="city-hero__week" aria-label="Weekly forecast">
              {weekDays.map((d, i) => {
                const slot = weatherPresentation(d.code);
                const dayLabel = dayCardLabel(d.date, timeZone);
                const weekday = dayLabel.isToday ? "Today" : dayLabel.weekday;
                return (
                  <div
                    key={d.date}
                    className="city-hero__week-day"
                    style={{
                      ["--weather-chip-i" as string]: String(i),
                    }}
                  >
                    <span className="city-hero__week-name">{weekday}</span>
                    <span className="city-hero__week-emoji" aria-hidden>
                      {slot.emoji}
                    </span>
                    <span className="city-hero__week-temps">
                      {formatWeatherTemp(d.highF)}
                      <span className="city-hero__week-sep">/</span>
                      {formatWeatherTemp(d.lowF)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <HourlyWeatherStrip
              hours={hourly}
              daily={weather?.daily ?? []}
              timeZone={timeZone}
            />
          )}
        </div>
      </WeatherReveal>
    </>
  );
}
