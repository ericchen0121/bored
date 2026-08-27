/**
 * Curated new restaurant openings per metro — editorial picks from Infatuation,
 * Eater, SF Standard, Reddit threads, blogs, and local press.
 *
 * Ingest materializes one stable feed row per entry (see `new_restaurants` adapter).
 */

export type NewRestaurantSource =
  | "infatuation"
  | "eater_sf"
  | "eater_chi"
  | "sf_standard"
  | "sf_chronicle"
  | "reddit"
  | "instagram"
  | "yelp"
  | "google_maps"
  | "blog"
  | "citycast";

export type CuratedNewRestaurant = {
  id: string;
  city: string;
  venueName: string;
  /** Short card title — venue + hook */
  title: string;
  hook: string;
  description: string;
  cuisine: string;
  neighborhood?: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** Primary editorial or venue link */
  url?: string;
  googleMapsUrl?: string;
  sources: NewRestaurantSource[];
  /** Approximate open month, e.g. `2026-07` */
  openedAt?: string;
  priceMin?: number;
  priceMax?: number;
  rating?: number;
};

/** SF / Bay — summer 2026 openings worth trying */
export const CURATED_NEW_RESTAURANTS_SF: CuratedNewRestaurant[] = [
  {
    id: "sf-saam",
    city: "sf",
    venueName: "Saam",
    title: "Saam — Bangkok celeb chef's first U.S. spot",
    hook: "World's 50 Best chef Ton Tassanakajohn debuts in SoMa",
    description:
      "Michelin-starred chef Thitid \"Ton\" Tassanakajohn (Le Du, Nusara) opens his first U.S. restaurant with punchy, non-adjustable Thai flavors — duck curry, khao soi, and salt-crusted branzino. Infatuation Hit List; Eater SF heatmap pick.",
    cuisine: "Thai",
    neighborhood: "SOMA",
    address: "415 Brannan St, San Francisco",
    lat: 37.7794,
    lng: -122.3953,
    url: "https://www.theinfatuation.com/san-francisco/reviews/saam",
    googleMapsUrl: "https://maps.google.com/?q=415+Brannan+St+San+Francisco",
    sources: ["infatuation", "eater_sf", "google_maps"],
    openedAt: "2026-07",
    priceMax: 65,
  },
  {
    id: "sf-chicano-nuevo",
    city: "sf",
    venueName: "Chicano Nuevo",
    title: "Chicano Nuevo — Baja fish-taco tasting menu",
    hook: "A decade in the making; $95 six-course Mission tasting",
    description:
      "State Bird alum Abe Núñez finally landed a brick-and-mortar after a decade of pop-ups. Six-course tasting menus center on elevated Baja fish tacos, kanpachi tostadas, and allium-driven coastal maximalism. SF Standard Eat Here Now pick.",
    cuisine: "Mexican",
    neighborhood: "Mission",
    address: "3355 Mission St, San Francisco",
    lat: 37.7421,
    lng: -122.4215,
    url: "https://sfstandard.com/2026/08/20/chicano-nuevo-review-new-restaurant/",
    googleMapsUrl: "https://maps.google.com/?q=3355+Mission+St+San+Francisco",
    sources: ["sf_standard", "google_maps"],
    openedAt: "2026-08",
    priceMin: 95,
    priceMax: 95,
  },
  {
    id: "sf-ka-kai",
    city: "sf",
    venueName: "Ka Kai",
    title: "Ka Kai — northern Thai in the Castro",
    hook: "Regional Chiang Mai cuisine; Khan-Thong tasting box",
    description:
      "Hyper-focused northern Thai from chef Tar Watcharin Pintisuep — nam prik num, khao soi, and a $85 Khan-Thong box for grazing the region. SF Standard calls it the Castro's best new restaurant and part of SF's Thai renaissance.",
    cuisine: "Thai",
    neighborhood: "Castro",
    address: "4133 18th St, San Francisco",
    lat: 37.761,
    lng: -122.434,
    url: "https://sfstandard.com/2026/08/23/ka-kai-northern-thai-restaurant-san-francisco/",
    googleMapsUrl: "https://maps.google.com/?q=4133+18th+St+San+Francisco",
    sources: ["sf_standard", "reddit", "google_maps"],
    openedAt: "2026-03",
    priceMax: 85,
  },
  {
    id: "sf-mess-hall",
    city: "sf",
    venueName: "The Mess Hall",
    title: "The Mess Hall — Presidio Tunnel Tops food hall",
    hook: "Korean, seafood, and burgers with Golden Gate views",
    description:
      "All-day Presidio food hall with Boda (Korean-Asian), Dayboat Seafood (raw bar + Dungeness crab sandwiches), and Breadwinner burgers — plus a full bar and picnic-ready market. Perfect before Tunnel Tops hangs.",
    cuisine: "Food hall",
    neighborhood: "Presidio",
    address: "201 Halleck St, San Francisco",
    lat: 37.7986,
    lng: -122.4668,
    url: "https://sf.eater.com/restaurant-news/213365/the-mess-hall-presidio-tunnel-tops-park-san-francisco-opening",
    googleMapsUrl: "https://maps.google.com/?q=201+Halleck+St+San+Francisco",
    sources: ["eater_sf", "infatuation", "google_maps"],
    openedAt: "2026-08",
  },
  {
    id: "sf-anju",
    city: "sf",
    venueName: "Anju",
    title: "Anju — Korean-Japanese izakaya",
    hook: "Chawanmushi, KFC, and sake in the Mission",
    description:
      "Low-lit Mission izakaya blending Korean fried chicken, chawanmushi, and seafood tofu soup with a deep sake list. On Eater SF's heatmap and Infatuation Hit List.",
    cuisine: "Korean-Japanese",
    neighborhood: "Mission",
    address: "206 Valencia St, San Francisco",
    lat: 37.7694,
    lng: -122.4219,
    url: "https://www.theinfatuation.com/san-francisco/reviews/anju",
    googleMapsUrl: "https://maps.google.com/?q=206+Valencia+St+San+Francisco",
    sources: ["infatuation", "eater_sf"],
    openedAt: "2026-06",
  },
  {
    id: "sf-iggys-burger",
    city: "sf",
    venueName: "Iggy's Burger",
    title: "Iggy's Burger — Castro smash burgers",
    hook: "Angela's Ice Cream team's third location",
    description:
      "Smash burgers, fried chicken sandwiches, and milkshakes from the Angela's Ice Cream team — Healdsburg roots, now on 18th Street. Infatuation Hit List after their first visit.",
    cuisine: "Burgers",
    neighborhood: "Castro",
    address: "4248 18th St, San Francisco",
    lat: 37.761,
    lng: -122.436,
    url: "https://www.theinfatuation.com/san-francisco/reviews/iggys-burger",
    googleMapsUrl: "https://maps.google.com/?q=4248+18th+St+San+Francisco",
    sources: ["infatuation", "yelp"],
    openedAt: "2026-07",
    priceMax: 20,
  },
  {
    id: "sf-ruay-mitr",
    city: "sf",
    venueName: "Ruay Mitr Chicken & Rice",
    title: "Ruay Mitr — Nob Hill khao mun gai",
    hook: "Casual Thai chicken rice specialist",
    description:
      "Counter-service Thai focused on khao mun gai and khao mun gai tod, plus khao soi, crab wontons, and ba mee moo dang. Infatuation new-openings guide pick.",
    cuisine: "Thai",
    neighborhood: "Nob Hill",
    address: "1059 Powell St, San Francisco",
    lat: 37.793,
    lng: -122.412,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=1059+Powell+St+San+Francisco",
    sources: ["infatuation", "google_maps"],
    openedAt: "2026-07",
    priceMax: 25,
  },
  {
    id: "sf-le-mils",
    city: "sf",
    venueName: "Le Mil's",
    title: "Le Mil's — Indian coffee shop",
    hook: "Chicory masala coffee and Saltwater pastries",
    description:
      "One of the city's few Indian coffee shops — chicory-forward masala coffee with butterfly pea foam, plus baked goods from Saltwater Bakeshop and Indian pastries on Polk.",
    cuisine: "Indian cafe",
    neighborhood: "Lower Nob Hill",
    address: "1330 Polk St, San Francisco",
    lat: 37.7885,
    lng: -122.4205,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=1330+Polk+St+San+Francisco",
    sources: ["infatuation"],
    openedAt: "2026-07",
    priceMax: 12,
  },
  {
    id: "sf-yumee-katsu",
    city: "sf",
    venueName: "Yumee Katsu",
    title: "Yumee Katsu — handroll-style katsu",
    hook: "Bay Area mini-chain's first SF outpost",
    description:
      "Fish, pork, and cheese-stuffed katsu plus curry and cheese corn noodles — Lower Pacific Heights outpost of the South Bay chain. Infatuation new-openings pick.",
    cuisine: "Japanese",
    neighborhood: "Lower Pacific Heights",
    address: "2340 Geary Blvd, San Francisco",
    lat: 37.785,
    lng: -122.436,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=2340+Geary+Blvd+San+Francisco",
    sources: ["infatuation", "yelp"],
    openedAt: "2026-08",
    priceMax: 22,
  },
  {
    id: "sf-brunos-italian",
    city: "sf",
    venueName: "Bruno's Italian Taste",
    title: "Bruno's Italian Taste — SoMa counter pasta",
    hook: "Pastas, pizzas, and happy-hour spritzes",
    description:
      "Counter-service Italian on Mission near the Embarcadero — pastas, paninis, and pizzas with a weekday happy hour of charcuterie and spritzes. Good solo lunch spot.",
    cuisine: "Italian",
    neighborhood: "SOMA",
    address: "606 Mission St, San Francisco",
    lat: 37.7878,
    lng: -122.399,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=606+Mission+St+San+Francisco",
    sources: ["infatuation"],
    openedAt: "2026-07",
    priceMax: 30,
  },
  {
    id: "sf-kaiyo-handroll",
    city: "sf",
    venueName: "Kaiyo Handroll Bar",
    title: "Kaiyo Handroll Bar — Nikkei handrolls",
    hook: "Peruvian-Japanese rolls on Union Street",
    description:
      "From Kaiyo SoMa founder John Park — made-to-order Nikkei handrolls, ceviche, and lomo saltado in Cow Hollow. Rolls delivered tableside from dining carts.",
    cuisine: "Nikkei",
    neighborhood: "Cow Hollow",
    address: "1838 Union St, San Francisco",
    lat: 37.7978,
    lng: -122.4335,
    url: "https://www.sfexaminer.com/culture/food-and-drink/kaiyo-founder-expands-to-cow-hollow-with-a-new-handroll-bar/",
    googleMapsUrl: "https://maps.google.com/?q=1838+Union+St+San+Francisco",
    sources: ["blog", "instagram"],
    openedAt: "2026-08",
    priceMax: 35,
  },
  {
    id: "sf-oklava",
    city: "sf",
    venueName: "Oklava Cafe",
    title: "Oklava Cafe — Turkish at Saluhall",
    hook: "Turquaz team's lahmacun and all-day breakfast",
    description:
      "Follow-up to Palo Alto's Oklava from the Turquaz team — Turkish coffee, lahmacun, pastries, and all-day breakfast at Market Street's Saluhall food hall.",
    cuisine: "Turkish",
    neighborhood: "Tenderloin",
    address: "945 Market St, San Francisco",
    lat: 37.7835,
    lng: -122.408,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=945+Market+St+San+Francisco",
    sources: ["infatuation", "eater_sf"],
    openedAt: "2026-06",
    priceMax: 25,
  },
  {
    id: "sf-broken-dreams",
    city: "sf",
    venueName: "Broken Dreams",
    title: "Broken Dreams — Oakland cơm tấm",
    hook: "Le Colonial alum's Vietnamese counter spot",
    description:
      "Downtown Oakland Vietnamese from a former Le Colonial chef — cơm tấm, rice bowls, and vermicelli salads. Worth the BART ride; Infatuation new-openings guide.",
    cuisine: "Vietnamese",
    neighborhood: "Oakland",
    address: "1312 Broadway, Oakland",
    lat: 37.8044,
    lng: -122.2712,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=1312+Broadway+Oakland",
    sources: ["infatuation", "reddit"],
    openedAt: "2026-07",
    priceMax: 22,
  },
  {
    id: "sf-jollibee",
    city: "sf",
    venueName: "Jollibee",
    title: "Jollibee — Filipino fast food on Market",
    hook: "Finally open — fried chicken and peach mango pies",
    description:
      "Years in the works: the Filipino fast-food chain lands on Market Street with crispy fried chicken, sweet spaghetti, and peach mango pies. Infatuation new-openings pick.",
    cuisine: "Filipino",
    neighborhood: "Tenderloin",
    address: "934 Market St, San Francisco",
    lat: 37.783,
    lng: -122.409,
    url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings",
    googleMapsUrl: "https://maps.google.com/?q=934+Market+St+San+Francisco",
    sources: ["infatuation", "instagram"],
    openedAt: "2026-07",
    priceMax: 15,
  },
];

/** Chicago — summer 2026 openings */
export const CURATED_NEW_RESTAURANTS_CHICAGO: CuratedNewRestaurant[] = [
  {
    id: "chi-gilda",
    city: "chicago",
    venueName: "Gilda",
    title: "Gilda — Basque pintxos tavern",
    hook: "Dirty Basque on Restaurant Row with jamón and conservas",
    description:
      "Jeremy Leven, Rafael Esparza, and Anthony Baier bring San Sebastián-style pintxos to West Town — jamón Iberico, miso tomatoes, Basque cheesecake. Eater Chicago opening pick.",
    cuisine: "Basque",
    neighborhood: "West Town",
    address: "1421 W Chicago Ave, Chicago",
    lat: 41.896,
    lng: -87.663,
    url: "https://chicago.eater.com/restaurant-news/168678/gilda-new-restaurant-opening-west-town-chicago-basque-pintxos-conservas",
    googleMapsUrl: "https://maps.google.com/?q=1421+W+Chicago+Ave+Chicago",
    sources: ["eater_chi", "yelp"],
    openedAt: "2026-07",
    priceMax: 55,
  },
  {
    id: "chi-muhajir",
    city: "chicago",
    venueName: "Muhājir",
    title: "Muhājir — migration through spice routes",
    hook: "Coach House team's Lincoln Park tasting room",
    description:
      "Chef Zubair Mohajir's most anticipated project — a menu tracing migration through historic spice routes. Sibling Filipino cocktail lounge Bobo opens behind the dining room.",
    cuisine: "Global",
    neighborhood: "Lincoln Park",
    address: "2630 N Clark St, Chicago",
    lat: 41.929,
    lng: -87.644,
    url: "https://chicago.eater.com/restaurant-news/168434/muhajir-restaurant-bobo-filipino-bar-new-opening-july-2026",
    googleMapsUrl: "https://maps.google.com/?q=2630+N+Clark+St+Chicago",
    sources: ["eater_chi", "infatuation"],
    openedAt: "2026-07",
    priceMax: 85,
  },
  {
    id: "chi-bobo",
    city: "chicago",
    venueName: "Bobo",
    title: "Bobo — Filipino cocktail lounge",
    hook: "Hidden bar behind Muhājir",
    description:
      "Jacob Dela Cruz's Filipino street-market-inspired lounge — slow-cooked lamb ribs, kare kare prawns, and savory hopia with shrimp. Named after his dad; opens a week after Muhājir.",
    cuisine: "Filipino",
    neighborhood: "Lincoln Park",
    address: "2630 N Clark St, Chicago",
    lat: 41.929,
    lng: -87.644,
    url: "https://chicago.eater.com/restaurant-news/168434/muhajir-restaurant-bobo-filipino-bar-new-opening-july-2026",
    googleMapsUrl: "https://maps.google.com/?q=2630+N+Clark+St+Chicago",
    sources: ["eater_chi"],
    openedAt: "2026-07",
    priceMax: 45,
  },
  {
    id: "chi-drama-club",
    city: "chicago",
    venueName: "Drama Club",
    title: "Drama Club — mezcal cocktail lounge",
    hook: "Velvety Humboldt Park agave bar",
    description:
      "Moody cocktail lounge with one of Chicago's largest agave collections — Offline Crush (mezcal, cucumber, cardamom) and Piña Blanca on the opening menu. City Cast August pick.",
    cuisine: "Cocktail bar",
    neighborhood: "Humboldt Park",
    address: "819 N California Ave, Chicago",
    lat: 41.8965,
    lng: -87.697,
    url: "https://chicago.citycast.fm/food-drink/5-new-spots-to-dine-and-drink-august-2026",
    googleMapsUrl: "https://maps.google.com/?q=819+N+California+Ave+Chicago",
    sources: ["citycast", "eater_chi"],
    openedAt: "2026-07",
  },
  {
    id: "chi-yu-yubu",
    city: "chicago",
    venueName: "Yu-Yubu",
    title: "Yu-Yubu — yuba cafe and matcha bar",
    hook: "Chicago's first dedicated yuba spot",
    description:
      "Ceremonial matcha, tofu-pocket yuba rolls, and poke/donburi bowls on North Bridge's 4th floor — spicy tuna and miso butter corn yuba among the signatures.",
    cuisine: "Japanese",
    neighborhood: "Loop",
    address: "520 N Michigan Ave, Chicago",
    lat: 41.891,
    lng: -87.624,
    url: "https://chicago.eater.com/openings/168754/chicago-new-restaurant-bar-cafe-openings-august-2026",
    googleMapsUrl: "https://maps.google.com/?q=520+N+Michigan+Ave+Chicago",
    sources: ["eater_chi"],
    openedAt: "2026-07",
    priceMax: 22,
  },
  {
    id: "chi-kashgar",
    city: "chicago",
    venueName: "Kashgar Uyghur Dining",
    title: "Kashgar Uyghur Dining — hand-pulled lagman",
    hook: "Uyghur noodles and grilled kabobs in Albany Park",
    description:
      "Chinese Muslim Uyghur cuisine — hand-pulled lagman, savory dumplings, and grilled kabobs replacing the former Happy Star space. Eater Chicago August openings roundup.",
    cuisine: "Uyghur",
    neighborhood: "Albany Park",
    address: "4830 N Pulaski Rd, Chicago",
    lat: 41.968,
    lng: -87.728,
    url: "https://chicago.eater.com/openings/168754/chicago-new-restaurant-bar-cafe-openings-august-2026",
    googleMapsUrl: "https://maps.google.com/?q=4830+N+Pulaski+Rd+Chicago",
    sources: ["eater_chi", "yelp"],
    openedAt: "2026-07",
    priceMax: 25,
  },
  {
    id: "chi-mazor",
    city: "chicago",
    venueName: "Mazor",
    title: "Mazor — Guatemalan-Mexican masa lab",
    hook: "Blue corn quesadillas and $50 tasting menus",
    description:
      "Chef Cristian Orozco's counter-service spot spotlighting fresh nixtamalized masa from El Popocatepetl Tortilleria — tuna tostadas, tetelas, and optional $50 tasting menus. Eater + Infatuation heatmap.",
    cuisine: "Mexican-Guatemalan",
    neighborhood: "Fulton River District",
    address: "485 N Milwaukee Ave, Chicago",
    lat: 41.889,
    lng: -87.639,
    url: "https://www.theinfatuation.com/chicago/reviews/mazor",
    googleMapsUrl: "https://maps.google.com/?q=485+N+Milwaukee+Ave+Chicago",
    sources: ["infatuation", "eater_chi"],
    openedAt: "2026-06",
    priceMax: 50,
    rating: 8.0,
  },
  {
    id: "chi-roots-brunch",
    city: "chicago",
    venueName: "Roots: The Brunch Experience",
    title: "Roots — brunch in a restored church",
    hook: "Englewood native's Grand Crossing debut",
    description:
      "Brunch inside a restored church in Greater Grand Crossing — menu and interior honor Black roots. Already drawing big crowds since opening. City Cast August pick.",
    cuisine: "Brunch",
    neighborhood: "Grand Crossing",
    address: "7655 S Ingleside Ave, Chicago",
    lat: 41.756,
    lng: -87.602,
    url: "https://chicago.citycast.fm/food-drink/5-new-spots-to-dine-and-drink-august-2026",
    googleMapsUrl: "https://maps.google.com/?q=7655+S+Ingleside+Ave+Chicago",
    sources: ["citycast", "instagram"],
    openedAt: "2026-07",
    priceMax: 35,
  },
  {
    id: "chi-bumper-2-bumper",
    city: "chicago",
    venueName: "Bumper 2 Bumper",
    title: "Bumper 2 Bumper — late-night Logan Square burgers",
    hook: "Open till 2 a.m. near California Blue Line",
    description:
      "Casual burger stand steps from the California Blue Line — smash burgers and street food vibes for post-bar crowds on weekends. City Cast August pick.",
    cuisine: "Burgers",
    neighborhood: "Logan Square",
    address: "2649 N California Ave, Chicago",
    lat: 41.931,
    lng: -87.697,
    url: "https://chicago.citycast.fm/food-drink/5-new-spots-to-dine-and-drink-august-2026",
    googleMapsUrl: "https://maps.google.com/?q=2649+N+California+Ave+Chicago",
    sources: ["citycast", "reddit"],
    openedAt: "2026-07",
    priceMax: 18,
  },
];

export const CURATED_NEW_RESTAURANTS: CuratedNewRestaurant[] = [
  ...CURATED_NEW_RESTAURANTS_SF,
  ...CURATED_NEW_RESTAURANTS_CHICAGO,
];
