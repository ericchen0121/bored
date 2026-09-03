/**
 * Lightweight self-check for video carousel ranking (no vitest in repo yet).
 * Run: pnpm --filter @bored/shared exec tsx src/videoRanker.selftest.ts
 */
import { FEED_VIDEO_CAROUSEL_LIMIT } from "./videoFeed.js";
import {
  personalizeVideoCarouselCards,
  rankVideoCarousel,
  VIDEO_CREATOR_CAP,
} from "./videoRanker.js";
import type { Rankable } from "./ranker.js";
import type { FeedCard } from "./schemas.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function tip(
  id: string,
  opts: {
    publishedAt: Date;
    handle?: string;
    kind?: Rankable["kind"];
  },
): Rankable {
  return {
    id,
    kind: opts.kind ?? "recommendation",
    title: id,
    categories: ["food"],
    tags: ["instagram", "reel", opts.handle ?? "chef"],
    startsAt: new Date(),
    source: "instagram",
    publishedAt: opts.publishedAt,
    rawPayload: { handle: opts.handle ?? "chef", mediaType: "REELS" },
    mediaType: "REELS",
  };
}

const now = new Date("2026-09-03T18:00:00Z");

{
  const items = [
    tip("old", { publishedAt: new Date("2026-08-01T00:00:00Z") }),
    tip("mid", { publishedAt: new Date("2026-08-20T00:00:00Z") }),
    tip("new", { publishedAt: new Date("2026-09-02T00:00:00Z") }),
  ];
  const cards = rankVideoCarousel(items, { now, limit: 10 });
  assert(cards[0]?.id === "new", "sorts by publishedAt desc");
  assert(cards[1]?.id === "mid", "second is mid");
  assert(cards.every((c) => c.id !== "old"), "drops tips older than 30d");
}

{
  const items = Array.from({ length: 6 }, (_, i) =>
    tip(`a${i}`, {
      publishedAt: new Date(now.getTime() - i * 3600000),
      handle: "same",
    }),
  );
  const cards = rankVideoCarousel(items, { now, limit: 6, minFill: 1 });
  const firstWave = cards.slice(0, VIDEO_CREATOR_CAP);
  assert(
    firstWave.every((c) => c.id.startsWith("a")),
    "creator cap still returns items",
  );
  // After cap, deferred fills remaining — all 6 eventually OK when limit allows.
  assert(cards.length === 6, "fills after creator cap from deferred");
}

{
  const items = [
    tip("seen", { publishedAt: new Date("2026-09-01T00:00:00Z") }),
    tip("fresh", { publishedAt: new Date("2026-08-28T00:00:00Z") }),
  ];
  const cards = rankVideoCarousel(items, {
    now,
    impressedIds: new Set(["seen"]),
    minFill: 12,
    limit: 10,
  });
  assert(cards[0]?.id === "fresh", "prefers unseen over impressed");
  assert(
    cards.some((c) => c.id === "seen"),
    "falls back to impressed when under minFill",
  );
}

{
  const items = [
    tip("opened", { publishedAt: new Date("2026-09-01T00:00:00Z") }),
    tip("fresh", { publishedAt: new Date("2026-08-28T00:00:00Z") }),
  ];
  const cards = rankVideoCarousel(items, {
    now,
    openedIds: new Set(["opened"]),
    minFill: 1,
    limit: 10,
  });
  assert(cards.length === 1 && cards[0]?.id === "fresh", "hides opened when inventory ok");
}

{
  const pool: FeedCard[] = [
    {
      kind: "recommendation",
      id: "p1",
      title: "p1",
      subtitle: null,
      startsAt: now.toISOString(),
      endsAt: null,
      imageUrl: null,
      venueName: null,
      neighborhood: null,
      lat: null,
      lng: null,
      categories: ["food"],
      tags: ["instagram", "reel", "a"],
      source: "instagram",
      score: 1,
      bucket: "serendipity",
      publishedAt: new Date("2026-09-02T00:00:00Z").toISOString(),
      mediaType: "REELS",
    },
    {
      kind: "recommendation",
      id: "p2",
      title: "p2",
      subtitle: null,
      startsAt: now.toISOString(),
      endsAt: null,
      imageUrl: null,
      venueName: null,
      neighborhood: null,
      lat: null,
      lng: null,
      categories: ["food"],
      tags: ["instagram", "reel", "b"],
      source: "instagram",
      score: 1,
      bucket: "serendipity",
      publishedAt: new Date("2026-09-01T00:00:00Z").toISOString(),
      mediaType: "REELS",
    },
  ];
  const out = personalizeVideoCarouselCards(pool, {
    now,
    impressedIds: new Set(["p1"]),
    minFill: 1,
    limit: FEED_VIDEO_CAROUSEL_LIMIT,
  });
  assert(out[0]?.id === "p2", "personalize drops impressed when fill ok");
}

console.log("videoRanker.selftest: ok");
