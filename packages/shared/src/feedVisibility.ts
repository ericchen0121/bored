import { isEarlierEvent, isTimeTbaTag } from "./datetime";
import { isExhibitionTag } from "./exhibitions";

type TimedCard = {
  startsAt: string;
  endsAt?: string | null;
  tags?: string[] | null;
};

/**
 * Whether a card belongs in Today’s main list (feed or map).
 * Hides finished earlier events; keeps live overnight + exhibitions still open.
 */
export function isTodayFeedVisible(
  card: TimedCard,
  now: Date = new Date(),
): boolean {
  if (isExhibitionTag(card.tags) || isTimeTbaTag(card.tags)) {
    if (card.endsAt && new Date(card.endsAt).getTime() < now.getTime()) {
      return false;
    }
    return true;
  }
  return !isEarlierEvent(card.startsAt, card.endsAt, now);
}

export function filterTodayFeedVisible<T extends TimedCard>(
  cards: T[],
  now: Date = new Date(),
): T[] {
  return cards.filter((c) => isTodayFeedVisible(c, now));
}
