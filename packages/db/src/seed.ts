import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { resolve } from "node:path";
import { db } from "./index.js";
import { recurringShows, userProfiles, users } from "./schema.js";

config({ path: resolve(process.cwd(), "../../.env") });

const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

type ComedySeedRow = {
  name: string;
  venueName: string;
  neighborhood: string;
  address: string;
  weekday: number;
  nthWeekday: number | null;
  hour: number;
  minute: number;
  priceHint: string;
  comedySubtype: string;
  sourceUrl: string;
  trustWeight: number;
  lat: number;
  lng: number;
  city: string;
};

async function seed() {
  await db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      email: "you@bored.local",
      displayName: "You",
    })
    .onConflictDoNothing();

  await db
    .insert(userProfiles)
    .values({
      userId: DEMO_USER_ID,
      interests: [
        { category: "music.electronic", weight: 0.9 },
        { category: "comedy.underground", weight: 0.85 },
        { category: "comedy.club", weight: 0.7 },
        { category: "tech", weight: 0.6 },
        { category: "movies.arthouse", weight: 0.75 },
        { category: "food", weight: 0.5 },
        { category: "free", weight: 0.4 },
      ],
      neighborhoods: ["Mission", "North Beach", "SOMA"],
      budgetMax: 45,
      budgetTier: 2,
      budgetEnabled: false,
      preferFree: false,
      nightsOut: true,
      radiusMiles: 12,
      lat: 37.7749,
      lng: -122.4194,
      onboardingComplete: false,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        interests: [
          { category: "music.electronic", weight: 0.9 },
          { category: "comedy.underground", weight: 0.85 },
          { category: "comedy.club", weight: 0.7 },
          { category: "tech", weight: 0.6 },
          { category: "movies.arthouse", weight: 0.75 },
          { category: "food", weight: 0.5 },
          { category: "free", weight: 0.4 },
        ],
      },
    });

  const comedySeed: ComedySeedRow[] = [
    {
      name: "Coit Comedy",
      venueName: "Columbus Cafe (basement speakeasy)",
      neighborhood: "North Beach",
      address: "562 Green St, San Francisco, CA",
      weekday: 4,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$12–15 + 1 drink min",
      comedySubtype: "comedy.underground",
      sourceUrl: "https://www.coitcomedy.com/",
      trustWeight: 0.95,
      lat: 37.7995,
      lng: -122.4079,
      city: "sf",
    },
    {
      name: "Clement St Comedy",
      venueName: "Neck of the Woods",
      neighborhood: "Richmond",
      address: "406 Clement St, San Francisco, CA",
      weekday: 4,
      nthWeekday: null,
      hour: 19,
      minute: 0,
      priceHint: "Free–$12",
      comedySubtype: "comedy.open_mic",
      sourceUrl: "https://www.neckofthewoodssf.com/calendar/",
      trustWeight: 0.8,
      lat: 37.7829,
      lng: -122.4625,
      city: "sf",
    },
    {
      name: "Live at Deluxe",
      venueName: "Club Deluxe",
      neighborhood: "Haight",
      address: "1511 Haight St, San Francisco, CA",
      weekday: 1,
      nthWeekday: 3,
      hour: 21,
      minute: 0,
      priceHint: "Free",
      comedySubtype: "comedy.showcase",
      sourceUrl: "https://www.sfstandup.com/stagetime/",
      trustWeight: 0.75,
      lat: 37.7697,
      lng: -122.4469,
      city: "sf",
    },
    {
      name: "Hayes Valley Comedy Night",
      venueName: "The Function SF",
      neighborhood: "Hayes Valley",
      address: "San Francisco, CA",
      weekday: 2,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "Varies",
      comedySubtype: "comedy.showcase",
      sourceUrl: "https://www.sfbarguide.com/event-type/comedy-sf",
      trustWeight: 0.7,
      lat: 37.7765,
      lng: -122.4242,
      city: "sf",
    },
    {
      name: "Open Mic Comedy",
      venueName: "Question Mark Tavern",
      neighborhood: "Mission",
      address: "San Francisco, CA",
      weekday: 5,
      nthWeekday: null,
      hour: 21,
      minute: 0,
      priceHint: "Free / PWYC",
      comedySubtype: "comedy.open_mic",
      sourceUrl: "https://www.sfbarguide.com/event-type/comedy-sf",
      trustWeight: 0.7,
      lat: 37.7599,
      lng: -122.4148,
      city: "sf",
    },
    {
      name: "Zanies Open Mic",
      venueName: "Zanies Comedy Club",
      neighborhood: "Old Town",
      address: "1548 N Wells St, Chicago, IL",
      weekday: 1,
      nthWeekday: null,
      hour: 19,
      minute: 30,
      priceHint: "$5–10",
      comedySubtype: "comedy.open_mic",
      sourceUrl: "https://chicago.zanies.com/calendar/",
      trustWeight: 0.9,
      lat: 41.9097,
      lng: -87.6344,
      city: "chicago",
    },
    {
      name: "Comedy Bar Open Mic",
      venueName: "The Comedy Bar",
      neighborhood: "River West",
      address: "1460 N Milwaukee Ave, Chicago, IL",
      weekday: 3,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "Free–$5",
      comedySubtype: "comedy.open_mic",
      sourceUrl: "https://thecomedybar.com/shows/",
      trustWeight: 0.85,
      lat: 41.909,
      lng: -87.6745,
      city: "chicago",
    },
    {
      name: "Laugh Factory All-Stars",
      venueName: "Laugh Factory Chicago",
      neighborhood: "Lakeview",
      address: "3175 N Broadway, Chicago, IL",
      weekday: 5,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$20–35",
      comedySubtype: "comedy.club",
      sourceUrl: "https://www.laughfactory.com/clubs/chicago",
      trustWeight: 0.9,
      lat: 41.9398,
      lng: -87.6447,
      city: "chicago",
    },
    {
      name: "Second City e.t.c.",
      venueName: "Second City",
      neighborhood: "Old Town",
      address: "230 W North Ave, Chicago, IL",
      weekday: 6,
      nthWeekday: null,
      hour: 19,
      minute: 30,
      priceHint: "$25–45",
      comedySubtype: "comedy.showcase",
      sourceUrl: "https://www.secondcity.com/shows/chicago/",
      trustWeight: 0.95,
      lat: 41.9115,
      lng: -87.6355,
      city: "chicago",
    },
    {
      name: "Lincoln Lodge",
      venueName: "Lincoln Lodge",
      neighborhood: "Bucktown",
      address: "2040 N Milwaukee Ave, Chicago, IL",
      weekday: 4,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$10–15",
      comedySubtype: "comedy.showcase",
      sourceUrl: "https://lincolnlodge.com/",
      trustWeight: 0.8,
      lat: 41.9178,
      lng: -87.6776,
      city: "chicago",
    },
    {
      name: "iO Improv Jam",
      venueName: "iO Theater",
      neighborhood: "River North",
      address: "1501 N Kingsbury St, Chicago, IL",
      weekday: 2,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$14",
      comedySubtype: "comedy.underground",
      sourceUrl: "https://ioimprov.com/chicago/shows/",
      trustWeight: 0.85,
      lat: 41.9084,
      lng: -87.6528,
      city: "chicago",
    },
    {
      name: "Annoyance Saturday",
      venueName: "Annoyance Theatre",
      neighborhood: "Lakeview",
      address: "851 W Belmont Ave, Chicago, IL",
      weekday: 6,
      nthWeekday: null,
      hour: 21,
      minute: 0,
      priceHint: "$15–20",
      comedySubtype: "comedy.underground",
      sourceUrl: "https://theannoyance.com/shows/",
      trustWeight: 0.75,
      lat: 41.9398,
      lng: -87.6533,
      city: "chicago",
    },
    {
      name: "Comedy Store showcase",
      venueName: "The Comedy Store",
      neighborhood: "Hollywood",
      address: "8433 W Sunset Blvd, Los Angeles, CA",
      weekday: 5,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$25–45",
      comedySubtype: "comedy.club",
      sourceUrl: "https://www.comedystore.com/shows/",
      trustWeight: 0.95,
      lat: 34.0952,
      lng: -118.3739,
      city: "la",
    },
    {
      name: "Laugh Factory Hollywood",
      venueName: "Laugh Factory",
      neighborhood: "Hollywood",
      address: "8001 Sunset Blvd, Los Angeles, CA",
      weekday: 6,
      nthWeekday: null,
      hour: 19,
      minute: 30,
      priceHint: "$20–35",
      comedySubtype: "comedy.club",
      sourceUrl: "https://www.laughfactory.com/hollywood",
      trustWeight: 0.9,
      lat: 34.0983,
      lng: -118.3647,
      city: "la",
    },
    {
      name: "Hollywood Improv weekend",
      venueName: "Hollywood Improv",
      neighborhood: "Hollywood",
      address: "8162 Melrose Ave, Los Angeles, CA",
      weekday: 5,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$25–40",
      comedySubtype: "comedy.club",
      sourceUrl: "https://improv.com/hollywood/",
      trustWeight: 0.9,
      lat: 34.0835,
      lng: -118.3735,
      city: "la",
    },
    {
      name: "Dynasty Typewriter",
      venueName: "Dynasty Typewriter",
      neighborhood: "Westlake",
      address: "2511 Wilshire Blvd, Los Angeles, CA",
      weekday: 4,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$15–25",
      comedySubtype: "comedy.underground",
      sourceUrl: "https://www.dynastytypewriter.com/",
      trustWeight: 0.85,
      lat: 34.0578,
      lng: -118.2765,
      city: "la",
    },
    {
      name: "UCB Sunset",
      venueName: "Upright Citizens Brigade",
      neighborhood: "Hollywood",
      address: "5919 Franklin Ave, Los Angeles, CA",
      weekday: 3,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$12–20",
      comedySubtype: "comedy.showcase",
      sourceUrl: "https://ucbcomedy.com/",
      trustWeight: 0.85,
      lat: 34.1054,
      lng: -118.3162,
      city: "la",
    },
    {
      name: "Largo at the Coronet",
      venueName: "Largo",
      neighborhood: "Hollywood",
      address: "366 N La Cienega Blvd, Los Angeles, CA",
      weekday: 2,
      nthWeekday: null,
      hour: 20,
      minute: 0,
      priceHint: "$20–35",
      comedySubtype: "comedy.showcase",
      sourceUrl: "https://largo-la.com/",
      trustWeight: 0.9,
      lat: 34.0778,
      lng: -118.3765,
      city: "la",
    },
    {
      name: "Flappers Comedy Club",
      venueName: "Flappers Comedy Club",
      neighborhood: "Burbank",
      address: "102 E Magnolia Blvd, Burbank, CA",
      weekday: 5,
      nthWeekday: null,
      hour: 19,
      minute: 30,
      priceHint: "$15–25",
      comedySubtype: "comedy.club",
      sourceUrl: "https://www.flapperscomedy.com/",
      trustWeight: 0.8,
      lat: 34.1802,
      lng: -118.3117,
      city: "la",
    },
  ];

  for (const show of comedySeed) {
    const existing = await db
      .select()
      .from(recurringShows)
      .where(
        and(
          eq(recurringShows.name, show.name),
          eq(recurringShows.city, show.city),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      await db.insert(recurringShows).values(show);
    }
  }

  console.log("Seed complete. Demo user:", DEMO_USER_ID);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
