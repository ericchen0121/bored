"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import {
  defaultAreaForCity,
  feedFilterSourcesForCity,
  feedModeAllowsDate,
  metroFromArea,
  type FeedArea,
  type FeedCity,
} from "@bored/shared";
import { CitySelectMenu } from "@/components/CitySelectMenu";
import { api } from "@/lib/api";
import {
  feedHomeHref,
  isFeedCity,
  readFeedPrefs,
  rememberFeedPrefs,
} from "@/lib/feed-prefs";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [fallbackCity, setFallbackCity] = useState<FeedCity>("sf");

  const pathSegment = pathname.split("/").filter(Boolean)[0];
  const cityFromPath = isFeedCity(pathSegment) ? pathSegment : null;
  const city = cityFromPath ?? fallbackCity;

  useEffect(() => {
    if (cityFromPath) return;
    const stored = readFeedPrefs();
    if (stored) setFallbackCity(metroFromArea(stored.area));
  }, [cityFromPath, pathname]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    void api<{ onboardingComplete: boolean }>("/v1/me")
      .then((me) => setOnboardingComplete(me.onboardingComplete))
      .catch(() => setOnboardingComplete(false));
  }, [pathname]);

  if (pathname.startsWith("/admin") || /\/map\/?$/.test(pathname)) {
    return null;
  }

  function switchArea(nextArea: FeedArea) {
    const nextCity = metroFromArea(nextArea);
    const prefs = readFeedPrefs();
    const currentArea = prefs?.area ?? defaultAreaForCity(city);
    if (nextCity === city && nextArea === currentArea) return;

    const allowed = new Set(feedFilterSourcesForCity(nextCity));
    const sources = (prefs?.sources ?? []).filter((s) => allowed.has(s));
    const mode = prefs?.mode ?? "for_you";
    const topics = prefs?.topics ?? [];
    const date =
      prefs && feedModeAllowsDate(prefs.mode) ? (prefs.date ?? null) : null;
    rememberFeedPrefs(mode, nextArea, sources, date, topics);
    router.push(feedHomeHref(mode, nextArea, sources, date, topics));
  }

  function switchCity(nextCity: FeedCity) {
    switchArea(defaultAreaForCity(nextCity));
  }

  function goHome(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    router.push(feedHomeHref());
  }

  return (
    <header className="site-header">
      <Link
        href={`/${city}`}
        className="site-header__brand"
        onClick={goHome}
      >
        Bored<span>.</span>
      </Link>
      <div className="site-header__actions">
        <CitySelectMenu
          city={city}
          onSelectCity={switchCity}
          onSelectArea={switchArea}
        />
        <Link href="/onboarding" className="site-header__tastes">
          {onboardingComplete ? "Edit tastes" : "Set tastes"}
        </Link>
      </div>
    </header>
  );
}
