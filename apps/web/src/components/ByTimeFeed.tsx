"use client";

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { FeedCard } from "@bored/shared";
import {
  activityTipFallbackLabel,
  eventScanTagsForDisplay,
  exhibitionFeedTimeLabel,
  foodTipFallbackLabel,
  FEED_EDITORIAL_FOOD_TIP_LIMIT,
  isActivityRecommendationSource,
  isFeedVideoCard,
  isTheaterRecommendationSource,
  isExhibitionTag,
  isFeedEventLive,
  isFoodDealSource,
  isFoodRecommendationSource,
  isMusicFestivalSource,
  isNewRestaurantRecommendationSource,
  isTimeTbaTag,
  isTodayFeedVisible,
  musicFestivalFeedDateLabel,
  newRestaurantTipFallbackLabel,
  theaterTipFallbackLabel,
  registrationStatusLabel,
} from "@bored/shared";
import { feedCardPosterUrl } from "@/lib/api";
import { formatTime, groupCardsByDay } from "@/lib/datetime";
import { cardEventType } from "@/lib/evergreen-poster";
import { TimelineThumbMedia } from "@/components/EventPosterMedia";
import { LiveNowBadge } from "@/components/LiveNowBadge";
import { useNow } from "@/hooks/useNow";

export type FeedLayoutVariant = "default" | "large" | "text";

function LocationPinIcon() {
  return (
    <svg
      className="timeline-row__pin"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        d="M8 1.75c-2.4 0-4.35 1.9-4.35 4.25 0 3.2 4.35 8.25 4.35 8.25s4.35-5.05 4.35-8.25C12.35 3.65 10.4 1.75 8 1.75zm0 5.75a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
        fill="currentColor"
      />
    </svg>
  );
}

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
  const isTheaterTip = isTheaterRecommendationSource(card.source ?? "");
  const isEvergreenTip = isFoodTip || isActivityTip || isTheaterTip || isNewRestaurant;
  const isFoodDeal = isFoodDealSource(card.source);
  const isExhibition = isExhibitionTag(card.tags);
  const isMusicFestival = isMusicFestivalSource(card.source);
  const isTimeTba = isTimeTbaTag(card.tags);
  const tbaWhen = isTimeTba
    ? card.recommendationLabel?.trim() || "Times vary"
    : null;
  const tipLabel = isNewRestaurant
    ? newRestaurantTipFallbackLabel(card.recommendationLabel)
    : isTheaterTip
      ? theaterTipFallbackLabel(card.recommendationLabel)
      : isActivityTip
        ? activityTipFallbackLabel(card.recommendationLabel)
        : foodTipFallbackLabel(card.recommendationLabel);
  const eventType = cardEventType(card);

  const textOnly = variant === "text";
  const lumaLayout = variant === "large" || variant === "default";
  const scanTags = textOnly ? tags.slice(0, 1) : tags;

  const timeNode = isEvergreenTip ? (
    <span className="timeline-row__time is-untimed">Tip</span>
  ) : isExhibition ? (
    <span className="timeline-row__time is-untimed">
      {exhibitionFeedTimeLabel()}
    </span>
  ) : isMusicFestival ? (
    <span className="timeline-row__time is-untimed">
      {musicFestivalFeedDateLabel(card.startsAt, card.endsAt, timeZone)}
    </span>
  ) : isTimeTba ? (
    <span className="timeline-row__time is-untimed">{tbaWhen}</span>
  ) : live ? (
    <LiveNowBadge />
  ) : (
    <time className="timeline-row__time" dateTime={card.startsAt}>
      {formatTime(card.startsAt, timeZone)}
    </time>
  );

  const placeMeta =
    place || card.isFree || isEvergreenTip || isFoodDeal || isTimeTba ? (
      <p className={`meta${place && lumaLayout ? " timeline-row__place" : ""}`}>
        {isEvergreenTip ? tipLabel : isFoodDeal ? card.recommendationLabel : null}
        {(isEvergreenTip || isFoodDeal) && place ? " · " : ""}
        {place && lumaLayout ? (
          <span className="timeline-row__place-line">
            <LocationPinIcon />
            <span>{place}</span>
          </span>
        ) : (
          place
        )}
        {(place || isEvergreenTip || isFoodDeal || isTimeTba) && card.isFree
          ? " · "
          : ""}
        {card.isFree ? "Free" : ""}
      </p>
    ) : null;

  const tagsNode =
    scanTags.length > 0 || showReg ? (
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
    ) : null;

  const ratingsNode =
    !textOnly && card.ratings?.infatuation != null ? (
      <div className="ratings">
        <span className="badge rating-infatuation">
          Infatuation {Number(card.ratings.infatuation).toFixed(1)}
        </span>
      </div>
    ) : null;

  return (
    <article
      className={`timeline-row ${selected ? "is-selected" : ""} ${
        interactive ? "is-interactive" : ""
      } ${card.registrationStatus === "sold_out" ? "sold-out" : ""} ${
        variant !== "default" ? `timeline-row--${variant}` : "timeline-row--large"
      } ${earlier ? "is-earlier" : ""} ${live ? "is-live" : ""}`}
      style={style}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
    >
      <div className="timeline-row__rail" aria-hidden>
        <span className="timeline-row__dot" />
      </div>
      {lumaLayout ? (
        <div className="timeline-row__main">
          <div className="timeline-row__copy">
            <div className="timeline-row__time-col">{timeNode}</div>
            <h3>{card.title}</h3>
            {placeMeta}
            {tagsNode}
            {ratingsNode}
          </div>
          <TimelineThumbMedia
            imageUrl={feedCardPosterUrl(card)}
            eventType={eventType}
          />
        </div>
      ) : (
        <>
          <div className="timeline-row__time-col">{timeNode}</div>
          <div className="timeline-row__main">
            <div className="timeline-row__copy">
              <h3>{card.title}</h3>
              {placeMeta}
              {tagsNode}
            </div>
          </div>
        </>
      )}
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
    if (isTodayFeedVisible(card, now)) current.push(card);
    else earlier.push(card);
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

  const exhibitionCards = cards.filter((c) => isExhibitionTag(c.tags));
  const withoutExhibitions = cards.filter((c) => !isExhibitionTag(c.tags));

  const festivalCards = withoutExhibitions
    .filter((c) => isMusicFestivalSource(c.source))
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const withoutFestivals = withoutExhibitions.filter(
    (c) => !isMusicFestivalSource(c.source),
  );

  const notVideo = withoutFestivals.filter((c) => !isFeedVideoCard(c));

  const timed = notVideo.filter(
    (c) =>
      !isFoodRecommendationSource(c.source ?? "", c.categories) &&
      !isNewRestaurantRecommendationSource(c.source),
  );
  const foodTipsAll = notVideo.filter((c) =>
    isFoodRecommendationSource(c.source ?? "", c.categories),
  );
  const instagramOnly =
    sourceFilter.length === 1 && sourceFilter[0] === "instagram";
  const foodTips =
    instagramOnly || sourceFilter.includes("food")
      ? foodTipsAll
      : foodTipsAll.slice(0, FEED_EDITORIAL_FOOD_TIP_LIMIT);
  const newRestaurants = notVideo.filter((c) =>
    isNewRestaurantRecommendationSource(c.source),
  );

  const { earlier, current } = collapseEarlier
    ? partitionTimedCards(timed, now)
    : { earlier: [] as FeedCard[], current: timed };

  const days = groupCardsByDay(current, timeZone, now);
  let rowIndex = 0;

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

  const exhibitionSection = TipSection({
    heading: "On view",
    cards: exhibitionCards,
    timeZone,
    onSelect,
    isSelected,
    hideDayHeadings,
    rowIndexStart: rowIndex,
    variant,
    now,
  });
  rowIndex = exhibitionSection.nextIndex;

  // Always show the section title — festivals are upcoming multi-day runs, not
  // Today chrono slots (Today hides day headings, which would otherwise bury them).
  const festivalSection = TipSection({
    heading: "Music festivals",
    cards: festivalCards,
    timeZone,
    onSelect,
    isSelected,
    hideDayHeadings: false,
    rowIndexStart: rowIndex,
    variant,
    now,
  });
  rowIndex = festivalSection.nextIndex;

  const tipBlocks = (
    <>
      {newRestaurantsSection.node}
      {foodSection.node}
    </>
  );

  const exhibitionBlock = exhibitionSection.node;
  const festivalBlock = festivalSection.node;

  const layoutClass =
    variant === "text"
      ? " by-time--text"
      : variant === "large" || variant === "default"
        ? " by-time--large"
        : "";

  return (
    <div className={`by-time${layoutClass}`}>
      {tipsFirst ? tipBlocks : null}
      {earlierToggle}
      {earlierSection}
      {timedSections}
      {!tipsFirst ? tipBlocks : null}
      {exhibitionBlock}
      {festivalBlock}
    </div>
  );
}
