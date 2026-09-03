/**
 * Flagship multi-day music festivals — always materialized by `music_festival`
 * ingest. Ticketmaster may enrich image/price when inventory exists.
 */

export type CuratedMusicFestival = {
  id: string;
  city: string;
  title: string;
  description: string;
  venueName: string;
  neighborhood?: string;
  address: string;
  lat: number;
  lng: number;
  url: string;
  /** First festival day YYYY-MM-DD (local). */
  startDate: string;
  /** Last festival day YYYY-MM-DD inclusive (local). */
  endDate: string;
  startHour?: number;
  startMinute?: number;
  categories: string[];
  tags?: string[];
  imageUrl?: string;
  /** Ticketmaster Discovery keyword for optional price/image enrichment. */
  tmKeyword: string;
};

export const CURATED_MUSIC_FESTIVALS: CuratedMusicFestival[] = [
  {
    id: "chi-lollapalooza-2026",
    city: "chicago",
    title: "Lollapalooza 2026",
    description:
      "Four days in Grant Park — 170+ artists across eight stages on the Chicago lakefront.",
    venueName: "Grant Park",
    neighborhood: "Loop",
    address: "337 E Randolph St, Chicago, IL",
    lat: 41.8722,
    lng: -87.6192,
    url: "https://www.lollapalooza.com/tickets",
    startDate: "2026-07-30",
    endDate: "2026-08-02",
    startHour: 11,
    categories: ["music.live"],
    tags: ["festival", "music_festival", "lollapalooza"],
    tmKeyword: "Lollapalooza",
  },
  {
    id: "chi-arc-2026",
    city: "chicago",
    title: "ARC Music Festival 2026",
    description:
      "Chicago's house and techno weekend in Union Park — underground headliners and day passes.",
    venueName: "Union Park",
    neighborhood: "Near West Side",
    address: "1501 W Randolph St, Chicago, IL",
    lat: 41.8842,
    lng: -87.6636,
    url: "https://arcmusicfestival.com/",
    startDate: "2026-09-04",
    endDate: "2026-09-06",
    startHour: 12,
    categories: ["music.electronic", "music.techno", "music.house"],
    tags: ["festival", "music_festival", "arc"],
    tmKeyword: "ARC Music Festival",
  },
  {
    id: "chi-north-coast-2026",
    city: "chicago",
    title: "North Coast Music Festival 2026",
    description:
      "Labor Day weekend bass and electronic fest at SeatGeek Stadium — Bridgeview, south of the city.",
    venueName: "SeatGeek Stadium",
    neighborhood: "Bridgeview",
    address: "7000 S Harlem Ave, Bridgeview, IL",
    lat: 41.764,
    lng: -87.8064,
    url: "https://northcoastfestival.com/",
    startDate: "2026-09-04",
    endDate: "2026-09-06",
    startHour: 14,
    categories: ["music.electronic", "music.bass"],
    tags: ["festival", "music_festival", "north_coast"],
    tmKeyword: "North Coast Music Festival",
  },
  {
    id: "sf-portola-2026",
    city: "sf",
    title: "Portola Music Festival 2026",
    description:
      "Goldenvoice's Pier 80 waterfront fest — indie, electronic, and alt headliners on the bay.",
    venueName: "Pier 80",
    neighborhood: "Dogpatch",
    address: "Pier 80, San Francisco, CA",
    lat: 37.7649,
    lng: -122.3894,
    url: "https://portolamusicfestival.com/tickets",
    startDate: "2026-09-26",
    endDate: "2026-09-27",
    startHour: 12,
    categories: ["music.live", "music.indie", "music.electronic"],
    tags: ["festival", "music_festival", "portola"],
    tmKeyword: "Portola Music Festival",
  },
];
