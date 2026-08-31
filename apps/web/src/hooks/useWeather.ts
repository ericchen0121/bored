"use client";

import { useEffect, useState } from "react";
import {
  fetchWeatherCached,
  type WeatherSnapshot,
} from "@/lib/weather";

export function useWeather(
  lat: number,
  lng: number,
  timeZone: string,
): WeatherSnapshot | null {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    setWeather(null);
    void fetchWeatherCached(lat, lng, timeZone)
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, timeZone]);

  return weather;
}
