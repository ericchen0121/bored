"use client";

import { useEffect, useState } from "react";

const SOURCES_VIEW_KEY = "bored:dev:sourcesView";
export const DEV_FLAGS_CHANGED = "bored:dev-flags";

export function isSourcesViewEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOURCES_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSourcesViewEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(SOURCES_VIEW_KEY, "1");
    else localStorage.removeItem(SOURCES_VIEW_KEY);
    window.dispatchEvent(new Event(DEV_FLAGS_CHANGED));
  } catch {
    /* private mode / quota */
  }
}

export function useSourcesViewEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => isSourcesViewEnabled());

  useEffect(() => {
    setEnabled(isSourcesViewEnabled());
    const sync = () => setEnabled(isSourcesViewEnabled());
    window.addEventListener(DEV_FLAGS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DEV_FLAGS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return enabled;
}
