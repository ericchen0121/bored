import posthog from "posthog-js";

/**
 * Product analytics (PostHog). No-ops without NEXT_PUBLIC_POSTHOG_KEY.
 * Do not identify users as DEMO_USER_ID — shared demo identity would collapse everyone.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

export type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined | readonly string[]
>;

let initialized = false;

export function isAnalyticsEnabled(): boolean {
  return Boolean(KEY?.trim());
}

export function initAnalytics(): void {
  if (typeof window === "undefined" || !KEY?.trim() || initialized) return;
  posthog.init(KEY.trim(), {
    api_host: HOST,
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
  initialized = true;
}

export function track(event: string, props?: AnalyticsProps): void {
  if (typeof window === "undefined" || !KEY?.trim()) return;
  posthog.capture(event, props);
}

export function trackPageview(url: string): void {
  track("$pageview", { $current_url: url });
}

/** Skip ops UI from product analytics. */
export function shouldTrackPath(pathname: string): boolean {
  return !pathname.startsWith("/admin");
}

// --- Feature events (named for PostHog insights / funnels) ---

export function trackFeedModeChanged(props: {
  mode: string;
  city: string;
  area: string;
}): void {
  track("feed_mode_changed", props);
}

export function trackFeedAreaChanged(props: {
  area: string;
  city: string;
}): void {
  track("feed_area_changed", props);
}

export function trackFeedTopicChanged(props: {
  topics: readonly string[];
  city: string;
  surface: "feed" | "map";
}): void {
  track("feed_topic_changed", {
    topics: [...props.topics],
    topic: props.topics[0] ?? "all",
    city: props.city,
    surface: props.surface,
  });
}

export function trackFeedSourcesChanged(props: {
  sources: readonly string[];
  city: string;
}): void {
  track("feed_sources_changed", {
    sources: [...props.sources],
    source_count: props.sources.length,
    city: props.city,
  });
}

export function trackFeedViewChanged(props: { view: string }): void {
  track("feed_view_changed", props);
}

export function trackFeedDateChanged(props: {
  date: string | null;
  mode: string;
  city: string;
}): void {
  track("feed_date_changed", props);
}

export function trackFeedLoaded(props: {
  city: string;
  mode: string;
  area: string;
  card_count: number;
  topics: readonly string[];
  sources: readonly string[];
  view: string;
}): void {
  track("feed_loaded", {
    city: props.city,
    mode: props.mode,
    area: props.area,
    card_count: props.card_count,
    topics: [...props.topics],
    sources: [...props.sources],
    view: props.view,
  });
}

export function trackMapOpened(props: { city: string; area: string }): void {
  track("map_opened", props);
}

export function trackDetailOpened(props: {
  kind: "event" | "movie";
  id: string;
  surface: "feed" | "map" | "standalone";
}): void {
  track("detail_opened", props);
}

export function trackCtaClicked(props: {
  kind: "event" | "showtime";
  id: string;
  slot: "primary" | "secondary" | "tickets";
  source?: string;
}): void {
  track("cta_clicked", props);
}

export function trackCitySwitched(props: {
  from_city: string;
  to_city: string;
  to_area: string;
}): void {
  track("city_switched", props);
}

export function trackTastesOpened(props: {
  onboarding_complete: boolean;
}): void {
  track("tastes_opened", props);
}

export function trackOnboardingViewed(): void {
  track("onboarding_viewed");
}

export function trackOnboardingCompleted(props: {
  city: string;
  interest_count: number;
  neighborhood_count: number;
  budget_max: number;
}): void {
  track("onboarding_completed", props);
}
