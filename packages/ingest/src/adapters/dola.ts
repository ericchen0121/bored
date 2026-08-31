import {
  createDoStuffMediaAdapter,
  type DoStuffVenue,
} from "./doStuffMedia.js";

function inferLaCity(venue?: DoStuffVenue | null): string {
  const label = (venue?.city ?? venue?.title ?? venue?.full_address ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (label.includes("santa monica")) return "santa_monica";
  if (label.includes("pasadena")) return "pasadena";
  if (label.includes("burbank")) return "burbank";
  if (label.includes("glendale")) return "glendale";
  if (label.includes("long beach")) return "long_beach";
  if (label.includes("hollywood")) return "hollywood";
  if (label.includes("west hollywood")) return "west_hollywood";
  if (label.includes("culver")) return "culver_city";
  if (label.includes("venice")) return "venice";
  if (label.includes("inglewood")) return "inglewood";
  if (label.includes("anaheim")) return "anaheim";
  if (label.includes("irvine")) return "irvine";
  return "la";
}

/** DoLA — Los Angeles local events calendar (Do Stuff Media JSON). */
export const dolaAdapter = createDoStuffMediaAdapter({
  id: "dola",
  description: "DoLA Los Angeles events JSON",
  baseUrl: "https://dolosangeles.com",
  source: "dola",
  timezone: "America/Los_Angeles",
  inferCity: inferLaCity,
});
