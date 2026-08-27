/**
 * Per-metro config for the `food` ingest adapter (evergreen editorial tips).
 */

export type FoodMetroConfig = {
  /** Canonical metro slug stored on events.city */
  metro: "sf" | "chicago";
  /** Default city when geo cannot be inferred from content */
  defaultCity: string;
  eater: {
    feedUrl: string;
    organizer: string;
    /** Tag + rawPayload.outlet key */
    outletTag: "eater_sf" | "eater_chi";
  };
  infatuation: {
    reviewsUrl: string;
    /** e.g. /san-francisco or /chicago */
    canonicalPath: string;
  };
  /** SF-only FOUND Substack — omit for metros without a feed */
  found?: {
    feedUrl: string;
  };
};

export const FOOD_METRO_CONFIGS: readonly FoodMetroConfig[] = [
  {
    metro: "sf",
    defaultCity: "sf",
    eater: {
      feedUrl: "https://sf.eater.com/rss/index.xml",
      organizer: "Eater SF",
      outletTag: "eater_sf",
    },
    infatuation: {
      reviewsUrl: "https://www.theinfatuation.com/san-francisco/reviews",
      canonicalPath: "/san-francisco",
    },
    found: {
      feedUrl: "https://sf.itsfound.com/feed",
    },
  },
  {
    metro: "chicago",
    defaultCity: "chicago",
    eater: {
      feedUrl: "https://chicago.eater.com/rss/index.xml",
      organizer: "Eater Chicago",
      outletTag: "eater_chi",
    },
    infatuation: {
      reviewsUrl: "https://www.theinfatuation.com/chicago/reviews",
      canonicalPath: "/chicago",
    },
  },
] as const;
