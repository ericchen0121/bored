"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import {
  defaultAreaForCity,
  feedModeAllowsDate,
  metroFromArea,
  type FeedArea,
  type FeedCity,
} from "@bored/shared";
import { CitySelectMenu } from "@/components/CitySelectMenu";
import { useUser } from "@/components/UserProvider";
import { trackCitySwitched, trackTastesOpened } from "@/lib/analytics";
import {
  feedHomeHref,
  isFeedCity,
  readFeedPrefs,
  rememberFeedPrefs,
} from "@/lib/feed-prefs";
import { isSourcesViewEnabled } from "@/lib/dev-flags";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated, user, signOut, onboardingComplete } = useUser();
  const [fallbackCity, setFallbackCity] = useState<FeedCity>("sf");

  const pathSegment = pathname.split("/").filter(Boolean)[0];
  const cityFromPath = isFeedCity(pathSegment) ? pathSegment : null;
  const city = cityFromPath ?? fallbackCity;

  useEffect(() => {
    if (cityFromPath) return;
    const stored = readFeedPrefs();
    if (stored) setFallbackCity(metroFromArea(stored.area));
  }, [cityFromPath, pathname]);

  if (pathname.startsWith("/admin") || /\/map\/?$/.test(pathname)) {
    return null;
  }

  function switchArea(nextArea: FeedArea) {
    const nextCity = metroFromArea(nextArea);
    const prefs = readFeedPrefs();
    const currentArea = prefs?.area ?? defaultAreaForCity(city);
    if (nextCity === city && nextArea === currentArea) return;

    trackCitySwitched({
      from_city: city,
      to_city: nextCity,
      to_area: nextArea,
    });
    const mode = prefs?.mode ?? "today";
    const topics = prefs?.topics ?? [];
    const sources = isSourcesViewEnabled() ? (prefs?.sources ?? []) : [];
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
        <Link
          href="/onboarding"
          className="site-header__tastes"
          onClick={() =>
            trackTastesOpened({ onboarding_complete: onboardingComplete })
          }
        >
          {onboardingComplete ? "Edit tastes" : "Set tastes"}
        </Link>
        <Link
          href="/saved"
          className={`site-header__saved${pathname.startsWith("/saved") ? " is-active" : ""}`}
          aria-label="Saved"
          title="Saved"
        >
          <svg
            className="site-header__saved-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            aria-hidden
          >
            <path
              d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        {authenticated && user?.email ? (
          <button
            type="button"
            className="site-header__account"
            title={user.email}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
