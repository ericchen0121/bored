"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import {
  defaultAreaForCity,
  defaultFeedMode,
  feedFilterSourcesForCity,
  feedModeAllowsDate,
  metroFromArea,
  parseFeedSources,
  parseFeedTopics,
} from "@bored/shared";
import { useUser } from "@/components/UserProvider";
import { detectFeedArea } from "@/lib/detect-city";
import {
  areaFromCityPath,
  feedHomeHref,
  feedQueryString,
  parseFeedArea,
  parseFeedMode,
  readFeedPrefs,
  rememberFeedPrefs,
} from "@/lib/feed-prefs";
import { parseFeedDate } from "@/lib/datetime";

/**
 * Legacy `/` and cold-start entry: resolve city from query / prefs / geo,
 * then replace with `/{city}?…`. Defaults to Today; For you when signed in
 * with tastes.
 */
function RootRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated, onboardingComplete } = useUser();

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const hasArea = searchParams.has("area");
      const hasMode = searchParams.has("mode");

      if (hasArea || hasMode) {
        const area = hasArea
          ? parseFeedArea(searchParams.get("area"))
          : (readFeedPrefs()?.area ?? defaultAreaForCity("sf"));
        const city = metroFromArea(area);
        const mode = parseFeedMode(searchParams.get("mode"));
        const resolvedArea =
          city === "chicago"
            ? "chicago"
            : hasArea
              ? areaFromCityPath(city, searchParams.get("area"))
              : areaFromCityPath(city, null);
        const sources = parseFeedSources(searchParams.get("sources")).filter(
          (s) => feedFilterSourcesForCity(city).includes(s),
        );
        const topics = parseFeedTopics(searchParams.get("topics"));
        const date = feedModeAllowsDate(mode)
          ? parseFeedDate(searchParams.get("date"))
          : null;
        rememberFeedPrefs(mode, resolvedArea, sources, date, topics);
        const q = feedQueryString({
          mode,
          area: resolvedArea,
          sources,
          topics,
          date,
        });
        const params = new URLSearchParams(q);
        const e = searchParams.get("e");
        const m = searchParams.get("m");
        if (e) params.set("e", e);
        if (m) params.set("m", m);
        const qs = params.toString();
        if (!cancelled) {
          router.replace(qs ? `/${city}?${qs}` : `/${city}`);
        }
        return;
      }

      const stored = readFeedPrefs();
      if (stored) {
        if (!cancelled) router.replace(feedHomeHref());
        return;
      }

      if (!ready) return;

      const detected = await detectFeedArea();
      if (cancelled) return;
      const mode = defaultFeedMode({ authenticated, onboardingComplete });
      rememberFeedPrefs(mode, detected, [], null, []);
      router.replace(feedHomeHref(mode, detected, [], null, []));
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams, ready, authenticated, onboardingComplete]);

  return <p className="muted">Finding your city…</p>;
}

export default function RootPage() {
  return (
    <Suspense fallback={<p className="muted">Finding your city…</p>}>
      <RootRedirectInner />
    </Suspense>
  );
}
