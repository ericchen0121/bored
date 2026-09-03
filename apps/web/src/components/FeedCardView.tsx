"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import type { FeedCard } from "@bored/shared";
import {
  activityTipFallbackLabel,
  eventScanTagsForDisplay,
  FEED_TIMES_PREVIEW_LIMIT,
  foodTipFallbackLabel,
  isActivityRecommendationSource,
  isTheaterRecommendationSource,
  isExhibitionTag,
  exhibitionFeedTimeLabel,
  isFeedEventLive,
  isFoodDealSource,
  isFoodRecommendationSource,
  isFeedVideo,
  isHappyHoursHubCard,
  isNewRestaurantRecommendationSource,
  isTimeTbaTag,
  movieGenresForDisplay,
  newRestaurantTipFallbackLabel,
  theaterTipFallbackLabel,
  registrationStatusLabel,
} from "@bored/shared";
import { feedCardPosterUrl } from "@/lib/api";
import { formatDayOnly, formatTime, formatWhen } from "@/lib/datetime";
import { cardEventType, posterPlaceholderLabel } from "@/lib/evergreen-poster";
import { FilmRatingBadges } from "@/components/FilmRatingBadges";
import { FeedCardMedia } from "@/components/EventPosterMedia";
import { LiveNowBadge } from "@/components/LiveNowBadge";
import { useNow } from "@/hooks/useNow";

export function FeedCardView({
  card,
  style,
  selected = false,
  onSelect,
  timeZone = "America/Los_Angeles",
  size = "default",
}: {
  card: FeedCard;
  style?: CSSProperties;
  selected?: boolean;
  onSelect?: (card: FeedCard) => void;
  timeZone?: string;
  size?: "default" | "large" | "poster";
}) {
  const now = useNow();
  const isExhibition = isExhibitionTag(card.tags);
  const isTimeTba = isTimeTbaTag(card.tags);
  const tbaWhen =
    isTimeTba
      ? card.recommendationLabel?.trim() || "Times vary"
      : null;
  const live = isFeedEventLive(card.startsAt, card.endsAt, now, {
    tags: card.tags,
  });
  const bucketLabel = card.isSponsored
    ? "Sponsored"
    : card.bucket === "affinity"
      ? "For you"
      : card.bucket === "adjacent"
        ? "Nearby taste"
        : "Outside your usual";

  const eventType = cardEventType(card);
  const tags =
    card.kind === "event"
      ? eventScanTagsForDisplay(card.categories, card.tags, 3)
      : movieGenresForDisplay(card.tags, card.categories, 3);
  const posterCategory =
    card.kind === "event"
      ? eventScanTagsForDisplay(card.categories, card.tags, 1)[0]
      : movieGenresForDisplay(card.tags, card.categories, 1)[0];
  const isFoodTip = isFoodRecommendationSource(
    card.source ?? "",
    card.categories,
  );
  const isNewRestaurant = isNewRestaurantRecommendationSource(card.source);
  const isActivityTip = isActivityRecommendationSource(card.source ?? "");
  const isTheaterTip = isTheaterRecommendationSource(card.source ?? "");
  const isEvergreenTip = isFoodTip || isActivityTip || isTheaterTip || isNewRestaurant;
  const isFoodDeal = isFoodDealSource(card.source);
  const isHappyHoursHub = isHappyHoursHubCard(card);
  const isIgReel = isFeedVideo({
    source: card.source,
    tags: card.tags,
    rawPayload: { mediaType: card.mediaType },
  });
  const posterUrl = feedCardPosterUrl(card);
  const tipLabel = isNewRestaurant
    ? newRestaurantTipFallbackLabel(card.recommendationLabel)
    : isTheaterTip
      ? theaterTipFallbackLabel(card.recommendationLabel)
    : isActivityTip
      ? activityTipFallbackLabel(card.recommendationLabel)
      : foodTipFallbackLabel(card.recommendationLabel);
  const priceLabel = card.priceLabel;
  const regLabel =
    card.kind === "event"
      ? registrationStatusLabel(card.registrationStatus)
      : null;
  const showReg =
    regLabel &&
    card.registrationStatus &&
    card.registrationStatus !== "open";

  const previewTimes = (card.showtimesPreview ?? []).slice(
    0,
    FEED_TIMES_PREVIEW_LIMIT,
  );
  const moreTimesCount =
    card.showtimesMoreCount ??
    Math.max(
      0,
      (card.showtimesPreview?.length ?? 0) - FEED_TIMES_PREVIEW_LIMIT,
    );
  const hasMultipleTimes = previewTimes.length > 1 || moreTimesCount > 0;

  const interactive = Boolean(onSelect);

  const activate = () => onSelect?.(card);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  const cardClass = [
    "card",
    card.kind === "movie_showtime" ? "movie" : "",
    card.registrationStatus === "sold_out" ? "sold-out" : "",
    card.isSponsored ? "is-sponsored" : "",
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
    size === "large" ? "card--large" : "",
    size === "poster" ? "card--poster" : "",
    isHappyHoursHub ? "card--happy-hours-hub" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (size === "poster") {
    const categoryLabel = posterCategory?.label ?? eventType.label;
    const categoryClass =
      card.kind === "movie_showtime"
        ? "genre"
        : posterCategory && card.categories.includes(posterCategory.id)
          ? `type ${eventType.className}`
          : posterCategory
            ? "genre"
            : `type ${eventType.className}`;

    const whenLabel = live && !isEvergreenTip
      ? null
      : isEvergreenTip
        ? null
        : isExhibition
          ? exhibitionFeedTimeLabel()
          : isTimeTba
            ? tbaWhen
              ? `${formatDayOnly(card.startsAt, timeZone)} · ${tbaWhen}`
              : formatDayOnly(card.startsAt, timeZone)
            : hasMultipleTimes
              ? formatDayOnly(card.startsAt, timeZone)
              : formatWhen(card.startsAt, timeZone);

    return (
      <article
        className={cardClass}
        style={style}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={interactive ? selected : undefined}
        onClick={interactive ? activate : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
      >
        <FeedCardMedia
          imageUrl={posterUrl}
          eventType={eventType}
          placeholderLabel={posterPlaceholderLabel(card)}
          isVideo={isIgReel}
        />
        <div className="card__poster-copy">
          {(whenLabel || live) && (
            <div className="card__poster-when">
              {live && !isEvergreenTip ? <LiveNowBadge /> : whenLabel}
            </div>
          )}
          <h3>{card.title}</h3>
          <div className="card__poster-meta">
            <span className={`badge ${categoryClass}`}>{categoryLabel}</span>
            {card.isSponsored ? (
              <span className="badge sponsored">Sponsored</span>
            ) : null}
            {card.neighborhood ? (
              <span className="card__poster-place">{card.neighborhood}</span>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  const place = [card.venueName, card.neighborhood].filter(Boolean).join(" · ");

  const largeWhenLabel = (() => {
    if (live && !isEvergreenTip) return null;
    if (isEvergreenTip || isHappyHoursHub) return null;
    if (isExhibition) return exhibitionFeedTimeLabel();
    if (isTimeTba) {
      return tbaWhen
        ? `${formatDayOnly(card.startsAt, timeZone)} · ${tbaWhen}`
        : formatDayOnly(card.startsAt, timeZone);
    }
    if (isFoodDeal) return formatWhen(card.startsAt, timeZone);
    if (hasMultipleTimes) return formatDayOnly(card.startsAt, timeZone);
    return formatTime(card.startsAt, timeZone);
  })();

  return (
    <article
      className={cardClass}
      style={style}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
    >
      <FeedCardMedia
        imageUrl={posterUrl}
        eventType={eventType}
        placeholderLabel={posterPlaceholderLabel(card)}
        isVideo={isIgReel}
      />
      <div className="card__body">
        {size === "large" ? (
          <>
            {(live && !isEvergreenTip) || largeWhenLabel || isHappyHoursHub ? (
              <div className="card__when">
                {live && !isEvergreenTip ? (
                  <LiveNowBadge />
                ) : isHappyHoursHub ? (
                  <>
                    <LiveNowBadge />{" "}
                    {card.recommendationLabel ?? "Happening now"}
                  </>
                ) : (
                  largeWhenLabel
                )}
              </div>
            ) : null}
            <h3>{card.title}</h3>
            {(place ||
              tipLabel && isEvergreenTip ||
              isFoodDeal && card.recommendationLabel ||
              priceLabel) && (
              <div className="meta card__place">
                {place ? (
                  <>
                    <svg
                      className="card__place-pin"
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M8 1.75c-2.4 0-4.35 1.9-4.35 4.25 0 3.2 4.35 8.25 4.35 8.25s4.35-5.05 4.35-8.25C12.35 3.65 10.4 1.75 8 1.75zm0 5.75a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>
                      {isEvergreenTip ? `${tipLabel} · ` : null}
                      {isFoodDeal && card.recommendationLabel
                        ? `${card.recommendationLabel} · `
                        : null}
                      {place}
                      {priceLabel ? ` · ${priceLabel}` : ""}
                    </span>
                  </>
                ) : (
                  <span>
                    {isEvergreenTip ? tipLabel : null}
                    {isFoodDeal ? card.recommendationLabel : null}
                    {priceLabel
                      ? `${isEvergreenTip || isFoodDeal ? " · " : ""}${priceLabel}`
                      : ""}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <h3>{card.title}</h3>
            <div className="meta">
              {live && !isEvergreenTip ? (
                <>
                  <LiveNowBadge />
                  {card.venueName ? ` · ${card.venueName}` : ""}
                  {card.neighborhood ? ` · ${card.neighborhood}` : ""}
                </>
              ) : isEvergreenTip ? (
                <>
                  {tipLabel}
                  {card.venueName ? ` · ${card.venueName}` : ""}
                  {card.neighborhood ? ` · ${card.neighborhood}` : ""}
                </>
              ) : isExhibition ? (
                <>
                  {card.venueName ?? ""}
                  {card.venueName && card.neighborhood ? " · " : ""}
                  {card.neighborhood ?? ""}
                </>
              ) : isTimeTba ? (
                <>
                  {formatDayOnly(card.startsAt, timeZone)}
                  {tbaWhen ? ` · ${tbaWhen}` : ""}
                  {card.venueName ? ` · ${card.venueName}` : ""}
                  {card.neighborhood ? ` · ${card.neighborhood}` : ""}
                </>
              ) : isHappyHoursHub ? (
                <>
                  <LiveNowBadge />
                  {card.recommendationLabel ?? "Happening now"}
                </>
              ) : isFoodDeal ? (
                <>
                  {formatWhen(card.startsAt, timeZone)}
                  {card.recommendationLabel
                    ? ` · ${card.recommendationLabel}`
                    : ""}
                  {card.venueName ? ` · ${card.venueName}` : ""}
                  {card.neighborhood ? ` · ${card.neighborhood}` : ""}
                </>
              ) : (
                <>
                  {hasMultipleTimes || isTimeTba
                    ? formatDayOnly(card.startsAt, timeZone)
                    : formatWhen(card.startsAt, timeZone)}
                  {card.venueName ? ` · ${card.venueName}` : ""}
                  {card.neighborhood ? ` · ${card.neighborhood}` : ""}
                </>
              )}
              {priceLabel ? ` · ${priceLabel}` : ""}
            </div>
          </>
        )}
        {(tags.length > 0 || showReg) && (
          <div className="tags">
            {showReg && (
              <span
                className={`badge registration status-${card.registrationStatus}`}
              >
                {regLabel}
              </span>
            )}
            {tags.map((t) => (
              <span
                key={t.id}
                className={`badge ${
                  card.kind === "movie_showtime"
                    ? "genre"
                    : card.categories.includes(t.id)
                      ? `type ${eventType.className}`
                      : "genre"
                }`}
              >
                {t.label}
              </span>
            ))}
          </div>
        )}
        {card.ratings && (
          <>
            {card.ratings.infatuation != null && (
              <div className="ratings">
                <span className="badge rating-infatuation">
                  Infatuation {Number(card.ratings.infatuation).toFixed(1)}
                </span>
              </div>
            )}
            <FilmRatingBadges ratings={card.ratings} />
          </>
        )}
        {previewTimes.length > 0 && (
          <div className="times">
            {previewTimes.map((s) => (
              <span key={s.startsAt} className="time">
                {formatTime(s.startsAt, timeZone)}
              </span>
            ))}
            {moreTimesCount > 0 ? (
              <span className="time time--more">+{moreTimesCount} more</span>
            ) : null}
          </div>
        )}
        <span
          className={`bucket ${card.isSponsored ? "sponsored" : card.bucket}`}
        >
          {bucketLabel}
        </span>
      </div>
    </article>
  );
}
