/**
 * Sports team outbound links: prefer Ticketmaster-ingested attraction
 * externalLinks; fall back to a small known-team registry.
 */

export type SportsLeague =
  | "mlb"
  | "milb"
  | "nba"
  | "nfl"
  | "nhl"
  | "mls"
  | "usl"
  | "wnba"
  | "other";

export type SportsTeamProfile = {
  id: string;
  displayName: string;
  /** Lowercase aliases — exact equality only (no substring). */
  aliases: string[];
  league: SportsLeague;
  homepageUrl: string;
  /** Handle without @ */
  instagramHandle?: string;
};

export type SportsTeamOutboundLink = {
  kind: "homepage" | "instagram" | "wiki" | "league";
  label: string;
  href: string;
};

/** Ingested from TM attraction enrichment (`rawPayload.teams`). */
export type SportsTeamPayload = {
  name: string;
  attractionId?: string | null;
  homepageUrl?: string | null;
  instagramUrl?: string | null;
  wikiUrl?: string | null;
};

export type SportsTeamRow = {
  name: string;
  links: SportsTeamOutboundLink[];
};

function mlb(
  slug: string,
  displayName: string,
  aliases: string[],
  instagramHandle?: string,
): SportsTeamProfile {
  return {
    id: `mlb-${slug}`,
    displayName,
    aliases: [
      displayName.toLowerCase(),
      ...aliases.map((a) => a.toLowerCase()),
    ],
    league: "mlb",
    homepageUrl: `https://www.mlb.com/${slug}`,
    instagramHandle,
  };
}

/**
 * Fallback when TM attraction has no externalLinks (common for USL / MiLB).
 * Prefer ingest enrichment for coverage of visiting / national clubs.
 */
export const SPORTS_TEAMS: SportsTeamProfile[] = [
  mlb("athletics", "Athletics", ["oakland athletics", "a's", "as"], "athletics"),
  mlb("dbacks", "Arizona Diamondbacks", ["diamondbacks", "d-backs", "dbacks"], "dbacks"),
  mlb("braves", "Atlanta Braves", ["braves"], "braves"),
  mlb("orioles", "Baltimore Orioles", ["orioles"], "orioles"),
  mlb("redsox", "Boston Red Sox", ["red sox", "boston red sox"], "redsox"),
  mlb("cubs", "Chicago Cubs", ["cubs"], "cubs"),
  mlb("whitesox", "Chicago White Sox", ["white sox", "whitesox"], "whitesox"),
  mlb("reds", "Cincinnati Reds", ["reds"], "reds"),
  mlb("guardians", "Cleveland Guardians", ["guardians"], "cleguardians"),
  mlb("rockies", "Colorado Rockies", ["rockies"], "rockies"),
  mlb("tigers", "Detroit Tigers", ["tigers"], "tigers"),
  mlb("astros", "Houston Astros", ["astros"], "astros"),
  mlb("royals", "Kansas City Royals", ["royals"], "kcroyals"),
  mlb("angels", "Los Angeles Angels", ["la angels", "anaheim angels", "angels"], "angels"),
  mlb("dodgers", "Los Angeles Dodgers", ["la dodgers", "dodgers"], "dodgers"),
  mlb("marlins", "Miami Marlins", ["marlins"], "marlins"),
  mlb("brewers", "Milwaukee Brewers", ["brewers"], "brewers"),
  mlb("twins", "Minnesota Twins", ["twins"], "mntwins"),
  mlb("mets", "New York Mets", ["mets", "ny mets"], "mets"),
  mlb("yankees", "New York Yankees", ["yankees", "ny yankees"], "yankees"),
  mlb("phillies", "Philadelphia Phillies", ["phillies"], "phillies"),
  mlb("pirates", "Pittsburgh Pirates", ["pirates"], "pirates"),
  mlb("padres", "San Diego Padres", ["padres"], "padres"),
  // Bare "giants" omitted — clashes with San Jose Giants.
  mlb("giants", "San Francisco Giants", ["sf giants", "san fran giants"], "sfgiants"),
  mlb("mariners", "Seattle Mariners", ["mariners"], "mariners"),
  mlb("cardinals", "St. Louis Cardinals", ["st louis cardinals", "cardinals"], "cardinals"),
  mlb("rays", "Tampa Bay Rays", ["rays", "tampa bay rays"], "raysbaseball"),
  mlb("rangers", "Texas Rangers", ["rangers"], "rangers"),
  mlb("bluejays", "Toronto Blue Jays", ["blue jays", "bluejays"], "bluejays"),
  mlb("nationals", "Washington Nationals", ["nationals", "nats"], "nationals"),

  {
    id: "milb-sj-giants",
    displayName: "San Jose Giants",
    aliases: ["san jose giants", "sj giants"],
    league: "milb",
    homepageUrl: "https://www.milb.com/san-jose",
    instagramHandle: "sjgiants",
  },
  {
    id: "milb-visalia-rawhide",
    displayName: "Visalia Rawhide",
    aliases: ["visalia rawhide", "rawhide"],
    league: "milb",
    homepageUrl: "https://www.milb.com/visalia",
    instagramHandle: "visaliarawhide",
  },

  {
    id: "nba-bulls",
    displayName: "Chicago Bulls",
    aliases: ["chicago bulls", "bulls"],
    league: "nba",
    homepageUrl: "https://www.nba.com/bulls",
    instagramHandle: "chicagobulls",
  },
  {
    id: "nba-warriors",
    displayName: "Golden State Warriors",
    aliases: ["golden state warriors", "gsw", "warriors"],
    league: "nba",
    homepageUrl: "https://www.nba.com/warriors",
    instagramHandle: "warriors",
  },

  {
    id: "nfl-bears",
    displayName: "Chicago Bears",
    aliases: ["chicago bears", "bears"],
    league: "nfl",
    homepageUrl: "https://www.chicagobears.com",
    instagramHandle: "chicagobears",
  },
  {
    id: "nfl-49ers",
    displayName: "San Francisco 49ers",
    aliases: ["san francisco 49ers", "sf 49ers", "49ers", "niners"],
    league: "nfl",
    homepageUrl: "https://www.49ers.com",
    instagramHandle: "49ers",
  },

  {
    id: "nhl-blackhawks",
    displayName: "Chicago Blackhawks",
    aliases: ["chicago blackhawks", "blackhawks"],
    league: "nhl",
    homepageUrl: "https://www.nhl.com/blackhawks",
    instagramHandle: "nhlblackhawks",
  },
  {
    id: "nhl-sharks",
    displayName: "San Jose Sharks",
    aliases: ["san jose sharks", "sj sharks", "sharks"],
    league: "nhl",
    homepageUrl: "https://www.nhl.com/sharks",
    instagramHandle: "sanjosesharks",
  },

  {
    id: "mls-fire",
    displayName: "Chicago Fire FC",
    aliases: ["chicago fire", "chicago fire fc", "fire fc"],
    league: "mls",
    homepageUrl: "https://www.chicagofirefc.com",
    instagramHandle: "chicagofire",
  },
  {
    id: "mls-earthquakes",
    displayName: "San Jose Earthquakes",
    aliases: ["san jose earthquakes", "earthquakes", "quakes"],
    league: "mls",
    homepageUrl: "https://www.sjearthquakes.com",
    instagramHandle: "sjearthquakes",
  },

  {
    id: "usl-oakland-roots",
    displayName: "Oakland Roots",
    aliases: ["oakland roots", "oakland roots sc"],
    league: "usl",
    homepageUrl: "https://www.oaklandrootssc.com",
    instagramHandle: "oaklandrootssc",
  },
  {
    id: "usl-orange-county",
    displayName: "Orange County Soccer Club",
    aliases: [
      "orange county soccer club",
      "orange county sc",
      "ocsc",
    ],
    league: "usl",
    homepageUrl: "https://www.orangecountysoccer.com",
    instagramHandle: "orangecountysc",
  },
  {
    id: "nwsl-bay-fc",
    displayName: "Bay FC",
    aliases: ["bay fc", "bay football club"],
    league: "other",
    homepageUrl: "https://bayfc.com",
    instagramHandle: "bayfc",
  },
  {
    id: "wnba-valkyries",
    displayName: "Golden State Valkyries",
    aliases: ["golden state valkyries", "valkyries"],
    league: "wnba",
    homepageUrl: "https://valkyries.wnba.com",
    instagramHandle: "gsvalkyries",
  },

  {
    id: "wnba-sky",
    displayName: "Chicago Sky",
    aliases: ["chicago sky"],
    league: "wnba",
    homepageUrl: "https://sky.wnba.com",
    instagramHandle: "chicagosky",
  },
];

const LEAGUE_HUB: Partial<
  Record<SportsLeague, { label: string; href: string }>
> = {
  mlb: { label: "MLB", href: "https://www.mlb.com" },
  milb: { label: "MiLB", href: "https://www.milb.com" },
  nba: { label: "NBA", href: "https://www.nba.com" },
  nfl: { label: "NFL", href: "https://www.nfl.com" },
  nhl: { label: "NHL", href: "https://www.nhl.com" },
  mls: { label: "MLS", href: "https://www.mlssoccer.com" },
  usl: { label: "USL", href: "https://www.uslchampionship.com" },
  wnba: { label: "WNBA", href: "https://www.wnba.com" },
};

const ALIAS_MAP: Map<string, SportsTeamProfile> = (() => {
  const map = new Map<string, SportsTeamProfile>();
  for (const team of SPORTS_TEAMS) {
    const keys = new Set([
      team.displayName.toLowerCase(),
      ...team.aliases.map((a) => a.toLowerCase()),
    ]);
    for (const key of keys) {
      const existing = map.get(key);
      if (
        !existing ||
        team.displayName.toLowerCase() === key ||
        (existing.displayName.toLowerCase() !== key &&
          team.displayName.length >= existing.displayName.length)
      ) {
        map.set(key, team);
      }
    }
  }
  return map;
})();

export function resolveSportsTeam(
  name: string | null | undefined,
): SportsTeamProfile | null {
  const q = name?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return null;
  return ALIAS_MAP.get(q) ?? null;
}

export function sportsTeamOutboundLinks(
  team: SportsTeamProfile,
): SportsTeamOutboundLink[] {
  const links: SportsTeamOutboundLink[] = [
    { kind: "homepage", label: "Official site", href: team.homepageUrl },
  ];
  if (team.instagramHandle) {
    links.push({
      kind: "instagram",
      label: "Instagram",
      href: `https://www.instagram.com/${team.instagramHandle}/`,
    });
  }
  const hub = LEAGUE_HUB[team.league];
  if (hub && !team.homepageUrl.startsWith(hub.href)) {
    links.push({ kind: "league", label: hub.label, href: hub.href });
  }
  return links;
}

function firstUrl(v: unknown): string | null {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim())
    ? v.trim()
    : null;
}

export function parseSportsTeamsPayload(
  rawPayload: { teams?: unknown; artists?: unknown } | null | undefined,
): SportsTeamPayload[] {
  if (Array.isArray(rawPayload?.teams)) {
    const out: SportsTeamPayload[] = [];
    for (const row of rawPayload.teams) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      out.push({
        name,
        attractionId:
          typeof r.attractionId === "string" ? r.attractionId : null,
        homepageUrl: firstUrl(r.homepageUrl),
        instagramUrl: firstUrl(r.instagramUrl),
        wikiUrl: firstUrl(r.wikiUrl),
      });
      if (out.length >= 8) break;
    }
    if (out.length) return out;
  }
  return [];
}

function linksFromPayload(team: SportsTeamPayload): SportsTeamOutboundLink[] {
  const links: SportsTeamOutboundLink[] = [];
  if (team.homepageUrl) {
    links.push({
      kind: "homepage",
      label: "Official site",
      href: team.homepageUrl,
    });
  }
  if (team.instagramUrl) {
    links.push({
      kind: "instagram",
      label: "Instagram",
      href: team.instagramUrl,
    });
  }
  if (team.wikiUrl && links.length === 0) {
    links.push({ kind: "wiki", label: "Wikipedia", href: team.wikiUrl });
  }
  return links;
}

/** Pull team-ish names from TM `artists` / `teams` or "A vs B" titles. */
export function resolveSportsTeamNames(input: {
  title?: string | null;
  rawPayload?: { artists?: unknown; teams?: unknown } | null;
}): string[] {
  const fromTeams = parseSportsTeamsPayload(input.rawPayload).map((t) => t.name);
  if (fromTeams.length) return fromTeams;

  const fromPayload = Array.isArray(input.rawPayload?.artists)
    ? input.rawPayload.artists.filter(
        (a): a is string => typeof a === "string" && Boolean(a.trim()),
      )
    : [];
  if (fromPayload.length) {
    return fromPayload.map((a) => a.trim()).slice(0, 8);
  }

  const title = input.title?.trim() ?? "";
  if (!title) return [];
  const vs = title.split(/\s+vs\.?\s+/i);
  if (vs.length === 2) {
    return vs
      .map((side) =>
        side
          .replace(/\s*[:|–—-].*$/u, "")
          .replace(/#\S+/g, "")
          .trim(),
      )
      .filter((s) => s.length >= 2 && s.length <= 80)
      .slice(0, 2);
  }
  return [];
}

/**
 * Detail UI: ingested TM links first, then registry fallback per team name.
 */
export function resolveSportsTeamRows(input: {
  title?: string | null;
  rawPayload?: { artists?: unknown; teams?: unknown } | null;
}): SportsTeamRow[] {
  const payloadTeams = parseSportsTeamsPayload(input.rawPayload);
  const names = payloadTeams.length
    ? payloadTeams.map((t) => t.name)
    : resolveSportsTeamNames(input);

  const byName = new Map(payloadTeams.map((t) => [t.name.toLowerCase(), t]));
  const rows: SportsTeamRow[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const payload = byName.get(key);
    const fromIngest = payload ? linksFromPayload(payload) : [];
    if (fromIngest.length) {
      rows.push({ name, links: fromIngest });
      continue;
    }

    const reg = resolveSportsTeam(name);
    rows.push({
      name: reg?.displayName ?? name,
      links: reg ? sportsTeamOutboundLinks(reg) : [],
    });
  }

  return rows;
}
