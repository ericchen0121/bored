import { API_URL } from "./api";

export type EventOutboundSlot = "primary" | "secondary";

/** API redirect for event primary/secondary CTAs (affiliate + click log). */
export function eventOutboundHref(
  eventId: string,
  slot: EventOutboundSlot = "primary",
): string {
  const q = slot === "secondary" ? "?slot=secondary" : "";
  return `${API_URL}/r/e/${eventId}${q}`;
}

/** API redirect for movie showtime ticket CTAs. */
export function showtimeOutboundHref(showtimeId: string): string {
  return `${API_URL}/r/s/${showtimeId}`;
}
