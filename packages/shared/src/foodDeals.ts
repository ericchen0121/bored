/**
 * Curated SF/Bay Area happy hours and lunch specials from editorial sources
 * (Infatuation, Eater SF, SF Chronicle, SF Standard, Tablehopper).
 *
 * Ingest materializes these onto matching weekdays — unlike evergreen food tips,
 * deals have real day/time windows.
 */

export type FoodDealKind = "happy_hour" | "lunch";

export type FoodDealWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun–Sat

export type FoodDealSchedule = {
  /** Empty = every day */
  weekdays: FoodDealWeekday[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export type FoodDealSource =
  | "infatuation"
  | "eater_sf"
  | "eater_chi"
  | "sf_chronicle"
  | "sf_standard"
  | "tablehopper";

export type CuratedFoodDeal = {
  id: string;
  venueName: string;
  /** Short card title — venue + hook */
  title: string;
  dealSummary: string;
  description: string;
  dealKind: FoodDealKind;
  schedule: FoodDealSchedule;
  neighborhood?: string;
  address?: string;
  lat?: number;
  lng?: number;
  city?: string;
  url?: string;
  sources: FoodDealSource[];
  /** Infatuation-style editorial score when available */
  rating?: number;
  priceMin?: number;
  priceMax?: number;
};

const MON_THU: FoodDealWeekday[] = [1, 2, 3, 4];
const MON_FRI: FoodDealWeekday[] = [1, 2, 3, 4, 5];
const TUE_FRI: FoodDealWeekday[] = [2, 3, 4, 5];
const MON_SAT: FoodDealWeekday[] = [1, 2, 3, 4, 5, 6];
const TUE_SAT: FoodDealWeekday[] = [2, 3, 4, 5, 6];
const FRI_SUN: FoodDealWeekday[] = [5, 6, 0];
const DAILY: FoodDealWeekday[] = [];

/** Editorial picks — verify hours on venue sites before visiting. */
export const CURATED_FOOD_DEALS_SF: CuratedFoodDeal[] = [
  {
    id: "bubu-hh",
    venueName: "Bubu",
    title: "Bubu — sushi happy hour",
    dealSummary: "Handrolls, sashimi, and cocktails $8 or less",
    description:
      "Infatuation’s top sushi happy hour: $3 handrolls, $8 cocktails, and crispy-rice “bubus.” Arrive when they open — tables fill fast.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_THU,
      startHour: 16,
      startMinute: 30,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Lower Pacific Heights",
    address: "1800 Fillmore St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/bubu",
    sources: ["infatuation"],
    rating: 7.7,
    priceMax: 8,
  },
  {
    id: "little-shucker-hh",
    venueName: "Little Shucker",
    title: "Little Shucker — oyster happy hour",
    dealSummary: "$2 oysters, $10 wine, $7 beer",
    description:
      "Tomales Bay and Maine oysters at happy-hour prices in a breezy Pacific Heights shellfish bar.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_THU,
      startHour: 16,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Pacific Heights",
    address: "2016 Fillmore St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/little-shucker",
    sources: ["infatuation", "eater_sf"],
    rating: 8.7,
    priceMin: 2,
  },
  {
    id: "bar-crudo-hh",
    venueName: "Bar Crudo",
    title: "Bar Crudo — seafood happy hour",
    dealSummary: "$2 oysters, mussels, cod tacos, chowder specials",
    description:
      "Divisadero seafood spot with one of the city’s best oyster happy hours — high-quality fish at bar prices.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_SAT,
      startHour: 17,
      startMinute: 0,
      endHour: 18,
      endMinute: 30,
    },
    neighborhood: "NOPA",
    address: "655 Divisadero St, San Francisco",
    city: "sf",
    url: "https://sf.eater.com/maps/best-happy-hours-bars-san-francisco",
    sources: ["infatuation", "eater_sf"],
    rating: 8.0,
    priceMin: 2,
  },
  {
    id: "outta-sight-hh",
    venueName: "Outta Sight Pizza",
    title: "Outta Sight — slice happy hour",
    dealSummary: "Best-in-city slices $3–4 (2-slice limit)",
    description:
      "Tenderloin counter-service pizza — cheese, pepperoni, and specials at happy-hour prices plus discounted drinks.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_THU,
      startHour: 16,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Tenderloin",
    address: "422 Larkin St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/outta-sight-pizza",
    sources: ["infatuation"],
    rating: 9.1,
    priceMin: 3,
    priceMax: 4,
  },
  {
    id: "tataki-hh",
    venueName: "Tataki",
    title: "Tataki — sushi happy hour",
    dealSummary: "$7 plates — nigiri, rolls, handrolls",
    description:
      "Lower Pacific Heights sushi with a strong happy-hour menu and real plant-based options. Community favorite for value.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: DAILY,
      startHour: 17,
      startMinute: 0,
      endHour: 18,
      endMinute: 30,
    },
    neighborhood: "Lower Pacific Heights",
    address: "2827 California St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/tataki",
    sources: ["infatuation"],
    rating: 7.5,
    priceMax: 7,
  },
  {
    id: "taniku-hh",
    venueName: "Taniku",
    title: "Taniku — ramen & handroll happy hour",
    dealSummary: "$2.50 handrolls, $10 sake, ramen up to $8 off",
    description:
      "Tenderloin Japanese spot with generous portions — donburi and ramen deals worth sharing.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: DAILY,
      startHour: 16,
      startMinute: 30,
      endHour: 17,
      endMinute: 30,
    },
    neighborhood: "Tenderloin",
    address: "1035 Geary St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/taniku",
    sources: ["infatuation"],
    rating: 8.5,
    priceMin: 2,
  },
  {
    id: "billingsgate-hh",
    venueName: "Billingsgate",
    title: "Billingsgate — oyster happy hour",
    dealSummary: "Half-off oysters and cava",
    description:
      "Noe Valley seafood market and counter — fantastic clam chowder and shellfish at afternoon prices.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: TUE_FRI,
      startHour: 15,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
    neighborhood: "Noe Valley",
    address: "3859 24th St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/billingsgate",
    sources: ["infatuation"],
    rating: 8.5,
  },
  {
    id: "popis-oysterette-hh",
    venueName: "Popi's Oysterette",
    title: "Popi's Oysterette — Marina happy hour",
    dealSummary: "Mussels $9, wings $10, wine $8",
    description:
      "New Marina seafood spot that quickly became a neighborhood happy-hour favorite.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 15,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
    neighborhood: "Marina",
    address: "2095 Chestnut St, San Francisco",
    city: "sf",
    url: "https://sf.eater.com/maps/best-happy-hours-bars-san-francisco",
    sources: ["infatuation", "eater_sf"],
    rating: 8.1,
    priceMin: 6,
  },
  {
    id: "good-good-culture-club-hh",
    venueName: "Good Good Culture Club",
    title: "Good Good Culture Club — cocktail happy hour",
    dealSummary: "$9 cocktails and wine, $5–7 bar snacks",
    description:
      "Mission Filipino-American spot with daily highball and wine deals — great patio energy.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: DAILY,
      startHour: 17,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Mission",
    address: "3560 18th St, San Francisco",
    city: "sf",
    url: "https://sf.eater.com/maps/best-happy-hours-bars-san-francisco",
    sources: ["infatuation", "eater_sf"],
    rating: 8.4,
    priceMin: 5,
  },
  {
    id: "la-mar-hh",
    venueName: "La Mar",
    title: "La Mar — waterfront happy hour",
    dealSummary: "$10 cocktails, $7 empanadas, Embarcadero views",
    description:
      "Peruvian cocktails and ceviche on the covered waterside patio — classic SF happy hour with a view.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 15,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
    neighborhood: "Embarcadero",
    address: "Pier 1½, The Embarcadero N, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/la-mar",
    sources: ["infatuation", "eater_sf"],
    rating: 8.3,
    priceMin: 6,
  },
  {
    id: "chao-pescao-hh",
    venueName: "Chao Pescao",
    title: "Chao Pescao — Latin happy hour",
    dealSummary: "$4 off wine, $5 off cocktails, empanada deals (bar only)",
    description:
      "Bright Colombian-Cuban Civic Center spot — loud, fun, and one of the better value happy hours downtown.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: TUE_FRI,
      startHour: 15,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Civic Center",
    address: "272 McAllister St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/chao-pescao",
    sources: ["infatuation"],
    rating: 8.5,
  },
  {
    id: "mission-rock-resort-hh",
    venueName: "Mission Rock Resort",
    title: "Mission Rock Resort — waterfront oysters",
    dealSummary: "$1.50 oysters (6 min), $7 wine, bay views",
    description:
      "Dogpatch waterfront bar — ideal pre-game or post-work oysters with Chase Center views.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: TUE_FRI,
      startHour: 15,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Mission Bay",
    address: "817 Terry A Francois Blvd, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/mission-rock-resort",
    sources: ["infatuation"],
    priceMin: 1,
  },
  {
    id: "angler-hh",
    venueName: "Angler",
    title: "Angler — Embarcadero happy hour",
    dealSummary: "$4 oysters, $12 Parker house rolls, $14 cocktails",
    description:
      "Michelin-starred seafood without the full dinner price tag — embered tomato and seaweed butter bites.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: TUE_SAT,
      startHour: 17,
      startMinute: 0,
      endHour: 18,
      endMinute: 30,
    },
    neighborhood: "Embarcadero",
    address: "132 The Embarcadero, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/angler",
    sources: ["infatuation"],
    rating: 8.1,
    priceMin: 4,
  },
  {
    id: "horsefeather-hh",
    venueName: "Horsefeather",
    title: "Horsefeather — afternoon cocktails",
    dealSummary: "$12 cocktails, $8–12 bites, WiFi for WFH",
    description:
      "NoPa cocktail bar open at 2pm — swap your home office for an afternoon drink.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 14,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
    neighborhood: "NOPA",
    address: "528 Divisadero St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/horsefeather",
    sources: ["infatuation"],
    rating: 7.9,
    priceMin: 8,
  },
  {
    id: "perbacco-hh",
    venueName: "Perbacco",
    title: "Perbacco — FiDi happy hour",
    dealSummary: "$10 Negronis and martinis, supplì and pizzetta fritta",
    description:
      "Financial District Italian bar with updated happy-hour snacks — solid after-work FiDi move.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: TUE_FRI,
      startHour: 15,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Financial District",
    address: "230 California St, San Francisco",
    city: "sf",
    url: "https://www.tablehopper.com/newsletter/this-weeks-tablehopper-spring-to-mind-2/",
    sources: ["tablehopper"],
    priceMin: 6,
  },
  {
    id: "heartwood-lunch",
    venueName: "Heartwood",
    title: "Heartwood — penny martini lunch",
    dealSummary: "Buy a sandwich or salad, martini for $0.01",
    description:
      "FiDi lunch with a cult following — gin, vodka, espresso, or jasmine tea martini with any entrée.",
    dealKind: "lunch",
    schedule: {
      weekdays: MON_FRI,
      startHour: 11,
      startMinute: 30,
      endHour: 14,
      endMinute: 30,
    },
    neighborhood: "Financial District",
    address: "531 Commercial St, San Francisco",
    city: "sf",
    url: "https://www.theinfatuation.com/san-francisco/reviews/heartwood",
    sources: ["infatuation", "sf_standard"],
    priceMin: 1,
  },
  {
    id: "han-il-kwan-lunch",
    venueName: "Han Il Kwan",
    title: "Han Il Kwan — Korean lunch feast",
    dealSummary: "Multi-course lunch under $20 (bulgogi $19.50)",
    description:
      "Richmond classic — banchan, hot stone tofu stew, and protein for less than most SF lunches.",
    dealKind: "lunch",
    schedule: {
      weekdays: MON_FRI,
      startHour: 11,
      startMinute: 0,
      endHour: 16,
      endMinute: 0,
    },
    neighborhood: "Richmond",
    address: "1802 Balboa St, San Francisco",
    city: "sf",
    url: "https://sfstandard.com/2024/09/26/korean-spot-serves-colossal-lunch-feasts/",
    sources: ["sf_standard"],
    priceMax: 23,
  },
  {
    id: "lily-lunch",
    venueName: "Lily",
    title: "Lily — multicourse lunch special",
    dealSummary: "Appetizer, entree, and drink for $32",
    description:
      "Clement Street Vietnamese — duck confit egg rolls, bánh mì, or noodle bowls at incredible value Fri–Sun.",
    dealKind: "lunch",
    schedule: {
      weekdays: FRI_SUN,
      startHour: 11,
      startMinute: 30,
      endHour: 14,
      endMinute: 30,
    },
    neighborhood: "Inner Richmond",
    address: "225 Clement St, San Francisco",
    city: "sf",
    url: "https://www.sfchronicle.com/food/restaurants/article/lily-lunch-deal-sf-20187323.php",
    sources: ["sf_chronicle"],
    priceMax: 32,
  },
  {
    id: "angler-lunch",
    venueName: "Angler",
    title: "Angler — Quick Catch lunch",
    dealSummary: "3-course Michelin lunch for $45",
    description:
      "Pacific oysters, then half-portion sea bream or roasted chicken — waterfront views included.",
    dealKind: "lunch",
    schedule: {
      weekdays: TUE_SAT,
      startHour: 12,
      startMinute: 0,
      endHour: 14,
      endMinute: 30,
    },
    neighborhood: "Embarcadero",
    address: "132 The Embarcadero, San Francisco",
    city: "sf",
    url: "https://sfstandard.com/2024/08/15/angler-best-san-francisco-lunch-deal/",
    sources: ["sf_standard"],
    priceMax: 45,
  },
  {
    id: "hed-lunch",
    venueName: "hed",
    title: "hed — Thai lunch set",
    dealSummary: "5-dish khao gaeng set for $19.95",
    description:
      "Downtown Isan Thai — beef, fish, duck, or veg sets with tri-color rice. Casual midweek lunch spot.",
    dealKind: "lunch",
    schedule: {
      weekdays: MON_FRI,
      startHour: 11,
      startMinute: 30,
      endHour: 14,
      endMinute: 0,
    },
    neighborhood: "Financial District",
    address: "88 Hardie Pl, San Francisco",
    city: "sf",
    url: "https://www.tablehopper.com/the-hopper-notebook-five-places-to-eat-at-now/",
    sources: ["tablehopper"],
    priceMax: 20,
  },
];

/** Chicago happy hours / lunch specials — verify hours on venue sites. */
export const CURATED_FOOD_DEALS_CHICAGO: CuratedFoodDeal[] = [
  {
    id: "big-star-hh",
    venueName: "Big Star",
    title: "Big Star — taco happy hour",
    dealSummary: "$2 tacos, $5 margaritas, $4 beer",
    description:
      "Wicker Park taqueria with one of Chicago’s best patio HHs — go early on warm nights.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: DAILY,
      startHour: 17,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Wicker Park",
    address: "1531 N Damen Ave, Chicago",
    lat: 41.9094,
    lng: -87.6778,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/big-star",
    sources: ["infatuation", "eater_chi"],
    rating: 8.5,
    priceMin: 2,
    priceMax: 5,
  },
  {
    id: "monteverde-bar-hh",
    venueName: "Monteverde",
    title: "Monteverde — bar happy hour",
    dealSummary: "$10 spritzes, wine, and bar snacks",
    description:
      "West Loop pasta destination’s bar room runs a tight HH before the dinner rush — great for a quick drink and bite.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: TUE_SAT,
      startHour: 16,
      startMinute: 0,
      endHour: 17,
      endMinute: 30,
    },
    neighborhood: "West Loop",
    address: "1020 W Madison St, Chicago",
    lat: 41.8825,
    lng: -87.6528,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/monteverde",
    sources: ["infatuation"],
    rating: 9.2,
    priceMax: 10,
  },
  {
    id: "the-dawson-hh",
    venueName: "The Dawson",
    title: "The Dawson — cocktail happy hour",
    dealSummary: "Discounted cocktails and snacks at the bar",
    description:
      "Fulton Market cocktail bar with a reliable weekday HH — good stop before a West Loop dinner.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 16,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "West Loop",
    address: "736 W Madison St, Chicago",
    lat: 41.8816,
    lng: -87.6475,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/the-dawson",
    sources: ["infatuation", "eater_chi"],
    rating: 8.4,
  },
  {
    id: "duck-duck-goat-hh",
    venueName: "Duck Duck Goat",
    title: "Duck Duck Goat — dim sum happy hour",
    dealSummary: "Discounted dim sum and cocktails",
    description:
      "Stephan Izard’s Chinese spot runs a popular HH — dumplings and drinks at bar prices.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 16,
      startMinute: 30,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Fulton Market",
    address: "857 W Fulton Market, Chicago",
    lat: 41.8867,
    lng: -87.6498,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/duck-duck-goat",
    sources: ["infatuation"],
    rating: 8.1,
  },
  {
    id: "violet-hour-hh",
    venueName: "The Violet Hour",
    title: "The Violet Hour — cocktail hour",
    dealSummary: "Select cocktails and snacks at reduced prices",
    description:
      "Wicker Park speakeasy-style bar — HH is one of the easier ways to get in without a long wait.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: [0, 1, 2, 3, 4] as FoodDealWeekday[],
      startHour: 17,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
    },
    neighborhood: "Wicker Park",
    address: "1520 N Damen Ave, Chicago",
    lat: 41.9093,
    lng: -87.6776,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/the-violet-hour",
    sources: ["infatuation"],
    rating: 8.8,
  },
  {
    id: "lonesome-rose-hh",
    venueName: "Lonesome Rose",
    title: "Lonesome Rose — Logan Square HH",
    dealSummary: "$8 cocktails, $5 beer, snack specials",
    description:
      "Logan Square all-day café/bar with a laid-back HH — good for groups and late-afternoon hangs.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 16,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "Logan Square",
    address: "2100 N California Ave, Chicago",
    lat: 41.9203,
    lng: -87.6972,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/lonesome-rose",
    sources: ["infatuation", "eater_chi"],
    rating: 8.0,
    priceMax: 8,
  },
  {
    id: "sky-pilsen-hh",
    venueName: "S.K.Y.",
    title: "S.K.Y. — Pilsen happy hour",
    dealSummary: "Discounted cocktails and small plates",
    description:
      "New American in Pilsen with a strong bar program — HH is the move before a full dinner.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: [3, 4, 5, 6] as FoodDealWeekday[],
      startHour: 17,
      startMinute: 0,
      endHour: 18,
      endMinute: 30,
    },
    neighborhood: "Pilsen",
    address: "1239 W 18th St, Chicago",
    lat: 41.8578,
    lng: -87.6578,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/s-k-y",
    sources: ["infatuation"],
    rating: 8.6,
  },
  {
    id: "the-gage-hh",
    venueName: "The Gage",
    title: "The Gage — Loop happy hour",
    dealSummary: "Half-off select wines, beers, and bar bites",
    description:
      "Michigan Avenue gastropub with one of the Loop’s most reliable HHs — ideal before theater or after work.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 14,
      startMinute: 30,
      endHour: 17,
      endMinute: 0,
    },
    neighborhood: "The Loop",
    address: "24 S Michigan Ave, Chicago",
    lat: 41.8813,
    lng: -87.6248,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/the-gage",
    sources: ["infatuation", "eater_chi"],
    rating: 8.2,
  },
  {
    id: "beatnik-hh",
    venueName: "Beatnik on the River",
    title: "Beatnik — West Loop HH",
    dealSummary: "Tropical cocktails and snacks at happy-hour prices",
    description:
      "Jungle-themed West Loop bar — HH drinks feel like a mini vacation before dinner on Randolph.",
    dealKind: "happy_hour",
    schedule: {
      weekdays: MON_FRI,
      startHour: 16,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    },
    neighborhood: "West Loop",
    address: "180 N Wacker Dr, Chicago",
    lat: 41.8848,
    lng: -87.6375,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/beatnik-on-the-river",
    sources: ["infatuation"],
    rating: 7.9,
  },
  {
    id: "kimski-late",
    venueName: "Kimski",
    title: "Kimski — late-night Korean snacks",
    dealSummary: "Polish-Korean street food until late",
    description:
      "Bridgeport counter with pierogi kimbap and soju cocktails — not a classic HH, but one of the best late cheap eats in the city.",
    dealKind: "lunch",
    schedule: {
      weekdays: [4, 5, 6] as FoodDealWeekday[],
      startHour: 21,
      startMinute: 0,
      endHour: 23,
      endMinute: 30,
    },
    neighborhood: "Bridgeport",
    address: "954 W 31st St, Chicago",
    lat: 41.8378,
    lng: -87.6512,
    city: "chicago",
    url: "https://www.theinfatuation.com/chicago/reviews/kimski",
    sources: ["infatuation", "eater_chi"],
    rating: 8.3,
    priceMax: 15,
  },
];

export const CURATED_FOOD_DEALS: CuratedFoodDeal[] = [
  ...CURATED_FOOD_DEALS_SF,
  ...CURATED_FOOD_DEALS_CHICAGO,
];

const FOOD_DEAL_SOURCE_LABELS: Record<FoodDealSource, string> = {
  infatuation: "The Infatuation",
  eater_sf: "Eater SF",
  eater_chi: "Eater Chicago",
  sf_chronicle: "SF Chronicle",
  sf_standard: "SF Standard",
  tablehopper: "Tablehopper",
};

const FOOD_EDITORIAL_OUTLET_LABELS: Record<string, string> = {
  ...FOOD_DEAL_SOURCE_LABELS,
  found_sf: "FOUND SF",
};

export function foodDealKindLabel(kind: FoodDealKind): string {
  return kind === "happy_hour" ? "Happy hour" : "Lunch deal";
}

export function foodDealSourceLabel(source: FoodDealSource): string {
  return FOOD_DEAL_SOURCE_LABELS[source] ?? source;
}

/** Feed/detail eyebrow: `Happy hour · Daily · 5–6 PM` or `Happy hour · Infatuation` */
export function foodDealRecommendationLabel(opts: {
  dealKind: FoodDealKind;
  sources?: FoodDealSource[] | null;
  schedule?: FoodDealSchedule | null;
}): string {
  const kind = foodDealKindLabel(opts.dealKind);
  if (opts.schedule) {
    return `${kind} · ${foodDealScheduleLabel(opts.schedule)}`;
  }
  const primary = opts.sources?.[0];
  if (primary) return `${kind} · ${foodDealSourceLabel(primary)}`;
  return kind;
}

export function isFoodDealSource(source: string | null | undefined): boolean {
  return source === "food_deals";
}

/** Match weekday against schedule (empty weekdays = every day). */
export function foodDealMatchesWeekday(
  schedule: FoodDealSchedule,
  day: Date,
): boolean {
  if (!schedule.weekdays.length) return true;
  return schedule.weekdays.includes(day.getDay() as FoodDealWeekday);
}

export type FoodDealOccurrence = {
  startsAt: Date;
  endsAt: Date;
};

/** Build start/end on a calendar day from schedule hours (local wall clock). */
export function foodDealTimesOnDay(
  schedule: FoodDealSchedule,
  day: Date,
): FoodDealOccurrence {
  const startsAt = new Date(day);
  startsAt.setHours(schedule.startHour, schedule.startMinute, 0, 0);
  const endsAt = new Date(day);
  endsAt.setHours(schedule.endHour, schedule.endMinute, 0, 0);
  return { startsAt, endsAt };
}

/**
 * Next matching occurrence at or after `now` (within `horizonDays`).
 * Used as the durable row's `startsAt` for ranking proximity.
 */
export function nextFoodDealOccurrence(
  schedule: FoodDealSchedule,
  now: Date,
  horizonDays = 28,
): FoodDealOccurrence | null {
  for (let d = 0; d < horizonDays; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    if (!foodDealMatchesWeekday(schedule, day)) continue;
    const occ = foodDealTimesOnDay(schedule, day);
    if (occ.endsAt.getTime() < now.getTime() - 3600000) continue;
    return occ;
  }
  return null;
}

/**
 * All matching occurrences whose start falls in `[windowStart, windowEnd]`.
 * Empty weekdays = every day; used by the feed to expand one durable row.
 */
export function expandFoodDealOccurrences(
  schedule: FoodDealSchedule,
  windowStart: Date,
  windowEnd: Date,
): FoodDealOccurrence[] {
  const out: FoodDealOccurrence[] = [];
  const day = new Date(windowStart);
  day.setHours(0, 0, 0, 0);
  const endMs = windowEnd.getTime();
  // Cap expansion so a huge "all" window can't explode
  const maxDays = 31;
  for (let i = 0; i < maxDays; i++) {
    if (day.getTime() > endMs) break;
    if (foodDealMatchesWeekday(schedule, day)) {
      const occ = foodDealTimesOnDay(schedule, day);
      if (
        occ.startsAt.getTime() >= windowStart.getTime() &&
        occ.startsAt.getTime() <= endMs
      ) {
        out.push(occ);
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatHourMinute(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: minute === 0 ? undefined : "2-digit",
  });
}

/** Human schedule: `Daily · 5–6 PM`, `Mon–Thu · 4:30–6 PM`, `Fri–Sun · 5–7 PM` */
export function foodDealScheduleLabel(schedule: FoodDealSchedule): string {
  const time = `${formatHourMinute(schedule.startHour, schedule.startMinute)}–${formatHourMinute(schedule.endHour, schedule.endMinute)}`;
  if (!schedule.weekdays.length) return `Daily · ${time}`;

  const days = [...schedule.weekdays].sort((a, b) => a - b);
  const contiguous =
    days.length > 1 &&
    days.every((d, i) => i === 0 || d === days[i - 1]! + 1);

  const dayPart = contiguous
    ? `${WEEKDAY_SHORT[days[0]!]}–${WEEKDAY_SHORT[days[days.length - 1]!]}`
    : days.map((d) => WEEKDAY_SHORT[d]).join(", ");

  return `${dayPart} · ${time}`;
}

/** Parse schedule from rawPayload (ingest / feed). */
export function foodDealScheduleFromPayload(
  payload: Record<string, unknown> | null | undefined,
): FoodDealSchedule | null {
  const raw = payload?.schedule;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<FoodDealSchedule>;
  if (
    typeof s.startHour !== "number" ||
    typeof s.startMinute !== "number" ||
    typeof s.endHour !== "number" ||
    typeof s.endMinute !== "number"
  ) {
    return null;
  }
  const weekdays = Array.isArray(s.weekdays)
    ? (s.weekdays.filter((d) => typeof d === "number") as FoodDealWeekday[])
    : [];
  return {
    weekdays,
    startHour: s.startHour,
    startMinute: s.startMinute,
    endHour: s.endHour,
    endMinute: s.endMinute,
  };
}

/**
 * Expand durable food_deals rows into the feed window.
 * - `for_you`: one card per deal (row already holds next occurrence)
 * - timed modes: one ephemeral card per matching day in the window
 */
export function expandFoodDealRowsForFeed<
  T extends {
    source: string;
    startsAt: Date;
    endsAt?: Date | null;
    rawPayload?: unknown;
  },
>(
  rows: T[],
  opts: {
    mode: string;
    windowStart: Date;
    windowEnd: Date;
  },
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (row.source !== "food_deals") {
      out.push(row);
      continue;
    }
    const payload =
      (row.rawPayload as Record<string, unknown> | null | undefined) ?? null;
    const schedule = foodDealScheduleFromPayload(payload);
    if (!schedule || opts.mode === "for_you") {
      out.push(row);
      continue;
    }

    const occurrences = expandFoodDealOccurrences(
      schedule,
      opts.windowStart,
      opts.windowEnd,
    );
    if (!occurrences.length) continue;

    for (const occ of occurrences) {
      out.push({
        ...row,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
      });
    }
  }
  return out;
}

/** Human label for editorial attribution on food detail pages. */
export function foodEditorialOutletLabel(
  outlet: string | null | undefined,
): string | null {
  if (!outlet) return null;
  return FOOD_EDITORIAL_OUTLET_LABELS[outlet] ?? null;
}
