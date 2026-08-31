import {
  createDoStuffMediaAdapter,
  mapDoStuffCategories,
  resolveDoStuffImageUrl,
  type DoStuffImagery,
  type DoStuffVenue,
} from "./doStuffMedia.js";

function inferChicagoCity(venue?: DoStuffVenue | null): string {
  const label = (venue?.city ?? venue?.title ?? "").toLowerCase();
  if (label.includes("evanston")) return "evanston";
  if (label.includes("oak park")) return "oak_park";
  return "chicago";
}

/** @deprecated use resolveDoStuffImageUrl */
export function resolveDo312ImageUrl(
  imagery?: DoStuffImagery | null,
): string | null {
  return resolveDoStuffImageUrl(imagery);
}

/** @deprecated use mapDoStuffCategories */
export function mapDo312Categories(category: string | null | undefined): string[] {
  return mapDoStuffCategories(category);
}

/** Do312 Chicago local events calendar (public JSON). */
export const do312Adapter = createDoStuffMediaAdapter({
  id: "do312",
  description: "Do312 Chicago events JSON",
  baseUrl: "https://do312.com",
  source: "do312",
  timezone: "America/Chicago",
  inferCity: inferChicagoCity,
});
