import { fetchJson } from "./types.js";

export type TmAttractionExternalLinks = {
  homepage?: { url?: string }[];
  instagram?: { url?: string }[];
  wiki?: { url?: string }[];
  twitter?: { url?: string }[];
  facebook?: { url?: string }[];
};

export type TmAttractionDetail = {
  id?: string;
  name?: string;
  url?: string;
  externalLinks?: TmAttractionExternalLinks;
};

export type SportsTeamIngestLinks = {
  name: string;
  attractionId: string;
  homepageUrl: string | null;
  instagramUrl: string | null;
  wikiUrl: string | null;
};

function firstLinkUrl(
  links: { url?: string }[] | undefined,
): string | null {
  const url = links?.[0]?.url?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function sportsLinksFromAttraction(
  att: TmAttractionDetail,
): Omit<SportsTeamIngestLinks, "name" | "attractionId"> {
  const el = att.externalLinks;
  return {
    homepageUrl: firstLinkUrl(el?.homepage),
    instagramUrl: firstLinkUrl(el?.instagram),
    wikiUrl: firstLinkUrl(el?.wiki),
  };
}

/**
 * Fetch TM attraction details once per id (per adapter run).
 * Sports listings use homepage / Instagram / wiki from `externalLinks`.
 */
export function createAttractionLinkCache(apiKey: string) {
  const cache = new Map<string, Promise<TmAttractionDetail | null>>();
  let chain: Promise<void> = Promise.resolve();

  /** Serialize attraction GETs to stay under TM rate limits. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn);
    chain = run.then(
      () => new Promise((r) => setTimeout(r, 120)),
      () => new Promise((r) => setTimeout(r, 120)),
    );
    return run;
  }

  async function load(id: string): Promise<TmAttractionDetail | null> {
    const existing = cache.get(id);
    if (existing) return existing;
    const promise = enqueue(async () => {
      try {
        return await fetchJson<TmAttractionDetail>(
          `https://app.ticketmaster.com/discovery/v2/attractions/${encodeURIComponent(id)}.json?apikey=${encodeURIComponent(apiKey)}`,
        );
      } catch (err) {
        console.warn(
          `[ticketmaster] attraction ${id} enrich failed:`,
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    });
    cache.set(id, promise);
    return promise;
  }

  return {
    async resolveTeam(
      name: string,
      attractionId: string,
    ): Promise<SportsTeamIngestLinks> {
      const att = await load(attractionId);
      const links = att
        ? sportsLinksFromAttraction(att)
        : {
            homepageUrl: null,
            instagramUrl: null,
            wikiUrl: null,
          };
      return {
        name,
        attractionId,
        ...links,
      };
    },
  };
}
