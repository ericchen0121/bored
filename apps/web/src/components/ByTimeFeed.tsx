"use client";

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { FeedCard } from "@bored/shared";
import {
  activityTipFallbackLabel,
  eventScanTagsForDisplay,
  foodTipFallbackLabel,
  isActivityRecommendationSource,
  isEarlierEvent,
  isExhibitionTag,
  isFeedEventLive,
  isFoodDealSource,
  isFoodRecommendationSource,
  isNewRestaurantRecommendationSource,
  isTimeTbaTag,
  newRestaurantTipFallbackLabel,
  registrationStatusLabel,
} from "@bored/shared";
import { formatTime, groupCardsByDay } from "@/lib/datetime";
import { cardEventType } from "@/lib/evergreen-poster";
import { TimelineThumbMedia } from "@/components/EventPosterMedia";
import { LiveNowBadge } from "@/components/LiveNowBadge";
import { useNow } from "@/hooks/useNow";

export type FeedLayoutVariant = "default" | "large" | "text";

function TimelineRow({
  card,
  timeZone,
  selected,
  onSelect,
  style,
  variant = "default",
  live = false,
  earlier = false,
}: {
  card: FeedCard;
  timeZone: string;
  selected: boolean;
  onSelect?: (card: FeedCard) => void;
  style?: CSSProperties;
  variant?: FeedLayoutVariant;
  live?: boolean;
  earlier?: boolean;
}) {
  const tags =
    card.kind === "event"
      ? eventScanTagsForDisplay(card.categories, card.tags, 2)
      : [];
  const regLabel =
    card.kind === "event"
      ? registrationStatusLabel(card.registrationStatus)
      : null;
  const showReg =
    regLabel &&
    card.registrationStatus &&
    card.registrationStatus !== "open";

  const interactive = Boolean(onSelect);
  const activate = () => onSelect?.(card);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  const place = [card.venueName, card.neighborhood].filter(Boolean).join(" · ");
  const isFoodTip = isFoodRecommendationSource(
    card.source ?? "",
    card.categories,
  );
  const isNewRestaurant = isNewRestaurantRecommendationSource(card.source);
  const isActivityTip = isActivityRecommendationSource(card.source ?? "");
  const isEvergreenTip = isFoodTip || isActivityTip || isNewRestaurant;
  const isFoodDeal = isFoodDealSource(card.source);
  const isExhibition = isExhibitionTag(card.tags);
  const isTimeTba = isTimeTbaTag(card.tags);
  const tbaWhen = isTimeTba
    ? card.recommendationLabel?.trim() || "Times vary"
    : null;
  const tipLabel = isNewRestaurant
    ? newRestaurantTipFallbackLabel(card.recommendationLabel)
    : isActivityTip
      ? activityTipFallbackLabel(card.recommendationLabel)
      : foodTipFallbackLabel(card.recommendationLabel);
  const eventType = cardEventType(card);

  const textOnly = variant === "text";
  const scanTags = textOnly ? tags.slice(0, 1) : tags;

  return (
    <article
      className={`timeline-row ${selected ? "is-selected" : ""} ${
        interactive ? "is-interactive" : ""
      } ${card.registrationStatus === "sold_out" ? "sold-out" : ""} ${
        variant !== "default" ? `timeline-row--${variant}` : ""
      } ${earlier ? "is-earlier" : ""} ${live ? "is-live" : ""}`}
      style={style}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
    >
      {isEvergreenTip ? (
        <span className="timeline-row__time is-untimed">Tip</span>
      ) : isExhibition ? (
        <span className="timeline-row__time is-untimed">
          {card.recommendationLabel?.replace(/^Exhibition · /, "") ??
            "Exhibition"}
        </span>
      ) : isTimeTba ? (
        <span className="timeline-row__time is-untimed">
          {tbaWhen}
        </span>
      ) : (
        <div className="timeline-row__time-col">
          {live ? (
            <LiveNowBadge />
          ) : (
            <time className="timeline-row__time" dateTime={card.startsAt}>
              {formatTime(card.startsAt, timeZone)}
            </time>
          )}
        </div>
      )}
      <div className="timeline-row__main">
        {!textOnly && (
          <TimelineThumbMedia
            imageUrl={card.imageUrl}
            eventType={eventType}
          />
        )}
        <div className="timeline-row__copy">
          <h3>{card.title}</h3>
          {(place || card.isFree || isEvergreenTip || isFoodDeal || isExhibition || isTimeTba) && (
            <p className="meta">
              {isEvergreenTip
                ? tipLabel
                : isFoodDeal || isExhibition
                  ? card.recommendationLabel
                  : null}
              {(isEvergreenTip || isFoodDeal || isExhibition) && place ? " · " : ""}
              {place}
              {(place || isEvergreenTip || isFoodDeal || isExhibition || isTimeTba) && card.isFree ? " · " : ""}
              {card.isFree ? "Free" : ""}
            </p>
          )}
          {(scanTags.length > 0 || showReg) && (
            <div className="tags">
              {showReg && (
                <span
                  className={`badge registration status-${card.registrationStatus}`}
                >
                  {regLabel}
                </span>
              )}
              {scanTags.map((t) => (
                <span key={t.id} className="badge">
                  {t.label}
                </span>
              ))}
            </div>
          )}
          {!textOnly && card.ratings?.infatuation != null && (
            <div className="ratings">
              <span className="badge rating-infatuation">
                Infatuation {Number(card.ratings.infatuation).toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function TipSection({
  heading,
  cards: sectionCards,
  timeZone,
  onSelect,
  isSelected,
  hideDayHeadings,
  rowIndexStart,
  variant,
  now,
}: {
  heading: string;
  cards: FeedCard[];
  timeZone: string;
  onSelect?: (card: FeedCard) => void;
  isSelected: (card: FeedCard) => boolean;
  hideDayHeadings: boolean;
  rowIndexStart: number;
  variant: FeedLayoutVariant;
  now: Date;
}) {
  if (!sectionCards.length) return { node: null, nextIndex: rowIndexStart };

  let rowIndex = rowIndexStart;
  const node = (
    <section className="by-time__day">
      {!hideDayHeadings && <h3 className="by-time__heading">{heading}</h3>}
      <div className="by-time__list">
        {sectionCards.map((card) => {
          const i = rowIndex++;
          return (
            <TimelineRow
              key={`${card.id}:${card.startsAt}`}
              card={card}
              timeZone={timeZone}
              selected={isSelected(card)}
              onSelect={onSelect}
              variant={variant}
              live={isFeedEventLive(card.startsAt, card.endsAt, now, {
                tags: card.tags,
              })}
              style={{ animationDelay: `${Math.min(i, 24) * 35}ms` }}
            />
          );
        })}
      </div>
    </section>
  );
  return { node, nextIndex: rowIndex };
}

function partitionTimedCards(cards: FeedCard[], now: Date) {
  const earlier: FeedCard[] = [];
  const current: FeedCard[] = [];
  for (const card of cards) {
    if (isExhibitionTag(card.tags) || isTimeTbaTag(card.tags)) {
      if (card.endsAt && new Date(card.endsAt).getTime() < now.getTime()) {
        earlier.push(card);
      } else {
        current.push(card);
      }
      continue;
    }
    if (isEarlierEvent(card.startsAt, card.endsAt, now)) earlier.push(card);
    else current.push(card);
  }
  return { earlier, current };
}

export function FeedListView({
  cards,
  timeZone,
  onSelect,
  isSelected,
}: {
  cards: FeedCard[];
  timeZone: string;
  onSelect?: (card: FeedCard) => void;
  isSelected: (card: FeedCard) => boolean;
}) {
  const now = useNow();
  return (
    <div className="by-time by-time--text">
      <div className="by-time__list">
        {cards.map((card, i) => (
          <TimelineRow
            key={`${card.id}:${card.startsAt}`}
            card={card}
            timeZone={timeZone}
            selected={isSelected(card)}
            onSelect={onSelect}
            variant="text"
            live={isFeedEventLive(card.startsAt, card.endsAt, now, {
              tags: card.tags,
            })}
            style={{ animationDelay: `${Math.min(i, 24) * 35}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ByTimeFeed({
  cards,
  timeZone,
  onSelect,
  isSelected,
  hideDayHeadings = false,
  sourceFilter = [],
  variant = "default",
  /** Collapse finished (non-live) events behind a subtle “View earlier” control. */
  collapseEarlier = false,
}: {
  cards: FeedCard[];
  timeZone: string;
  onSelect?: (card: FeedCard) => void;
  isSelected: (card: FeedCard) => boolean;
  hideDayHeadings?: boolean;
  /** Active feed source chips — used to order sections for Instagram / food filters. */
  sourceFilter?: string[];
  variant?: FeedLayoutVariant;
  collapseEarlier?: boolean;
}) {
  const now = useNow();
  const [showEarlier, setShowEarlier] = useState(false);

  useEffect(() => {
    setShowEarlier(false);
  }, [collapseEarlier, cards]);

  const timed = cards.filter(
    (c) =>
      !isFoodRecommendationSource(c.source ?? "", c.categories) &&
      !isNewRestaurantRecommendationSource(c.source),
  );
  const foodTips = cards.filter((c) =>
    isFoodRecommendationSource(c.source ?? "", c.categories),
  );
  const newRestaurants = cards.filter((c) =>
    isNewRestaurantRecommendationSource(c.source),
  );

  const { earlier, current } = collapseEarlier
    ? partitionTimedCards(timed, now)
    : { earlier: [] as FeedCard[], current: timed };

  const days = groupCardsByDay(current, timeZone, now);
  let rowIndex = 0;

  const instagramOnly =
    sourceFilter.length === 1 && sourceFilter[0] === "instagram";
  const tipsFirst =
    instagramOnly ||
    (foodTips.length > 0 && foodTips.length >= timed.length);

  const foodHeading = instagramOnly
    ? "Instagram · where to eat"
    : "Where to eat";

  const earlierToggle =
    collapseEarlier && earlier.length > 0 ? (
      <button
        type="button"
        className="earlier-toggle"
        onClick={() => setShowEarlier((v) => !v)}
        aria-expanded={showEarlier}
      >
        {showEarlier
          ? "Hide earlier"
          : earlier.length === 1
            ? "View earlier event"
            : `View ${earlier.length} earlier`}
      </button>
    ) : null;

  const earlierSection =
    showEarlier && earlier.length > 0 ? (
      <div className="by-time__earlier" aria-label="Earlier today">
        <div className="by-time__list">
          {earlier.map((card) => {
            const i = rowIndex++;
            return (
              <TimelineRow
                key={`${card.id}:${card.startsAt}`}
                card={card}
                timeZone={timeZone}
                selected={isSelected(card)}
                onSelect={onSelect}
                variant={variant}
                earlier
                style={{ animationDelay: `${Math.min(i, 24) * 35}ms` }}
              />
            );
          })}
        </div>
        {current.length > 0 && <div className="by-time__earlier-rule" />}
      </div>
    ) : null;

  const timedSections = days.map((day) => (
    <section key={day.key} className="by-time__day">
      {!hideDayHeadings && (
        <h3 className="by-time__heading">{day.label}</h3>
      )}
      <div className="by-time__list">
        {day.cards.map((card) => {
          const i = rowIndex++;
          return (
            <TimelineRow
              key={`${card.id}:${card.startsAt}`}
              card={card}
              timeZone={timeZone}
              selected={isSelected(card)}
              onSelect={onSelect}
              variant={variant}
              live={isFeedEventLive(card.startsAt, card.endsAt, now, {
                tags: card.tags,
              })}
              style={{ animationDelay: `${Math.min(i, 24) * 35}ms` }}
            />
          );
        })}
      </div>
    </section>
  ));

  const newRestaurantsSection = TipSection({
    heading: "New restaurants to try",
    cards: newRestaurants,
    timeZone,
    onSelect,
    isSelected,
    hideDayHeadings,
    rowIndexStart: rowIndex,
    variant,
    now,
  });
  rowIndex = newRestaurantsSection.nextIndex;

  const foodSection = TipSection({
    heading: foodHeading,
    cards: foodTips,
    timeZone,
    onSelect,
    isSelected,
    hideDayHeadings,
    rowIndexStart: rowIndex,
    variant,
    now,
  });
  rowIndex = foodSection.nextIndex;

  const tipBlocks = (
    <>
      {newRestaurantsSection.node}
      {foodSection.node}
    </>
  );

  const layoutClass = variant === "default" ? "" : ` by-time--${variant}`;

  return (
    <div className={`by-time${layoutClass}`}>
      {tipsFirst ? tipBlocks : null}
      {earlierToggle}
      {earlierSection}
      {timedSections}
      {!tipsFirst ? tipBlocks : null}
    </div>
  );
}
