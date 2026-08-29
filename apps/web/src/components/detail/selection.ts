import type { FeedCard } from "@bored/shared";
import type { DetailSelection } from "./types";

export function selectionFromCard(card: FeedCard): DetailSelection {
  return card.kind === "movie_showtime" && card.filmId
    ? { kind: "movie", id: card.filmId }
    : { kind: "event", id: card.id };
}

export function cardMatchesSelection(
  card: FeedCard,
  sel: DetailSelection | null,
): boolean {
  if (!sel) return false;
  if (sel.kind === "event") return card.kind === "event" && card.id === sel.id;
  return (
    card.kind === "movie_showtime" &&
    (card.filmId === sel.id || card.id === sel.id)
  );
}

export function indexOfSelection(
  cards: FeedCard[],
  sel: DetailSelection | null,
): number {
  if (!sel) return -1;
  return cards.findIndex((c) => cardMatchesSelection(c, sel));
}
