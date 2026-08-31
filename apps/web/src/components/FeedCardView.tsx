"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import type { FeedCard } from "@bored/shared";
import {
  activityTipFallbackLabel,
  eventScanTagsForDisplay,
  FEED_TIMES_PREVIEW_LIMIT,
  foodTipFallbackLabel,
  isActivityRecommendationSource,
  isExhibitionTag,
  isFeedEventLive,
  isFoodDealSource,
  isFoodRecommendationSource,
  isInstagramVideo,
  isNewRestaurantRecommendationSource,
  isTimeTbaTag,
  movieGenresForDisplay,
  newRestaurantTipFallbackLabel,
  registrationStatusLabel,
} from "@bored/shared";
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
  const isEvergreenTip = isFoodTip || isActivityTip || isNewRestaurant;
  const isFoodDeal = isFoodDealSource(card.source);
  const isIgReel = isInstagramVideo({ source: card.source, tags: card.tags });
  const tipLabel = isNewRestaurant
    ? newRestaurantTipFallbackLabel(card.recommendationLabel)
    : isActivityTip
      ? activityTipFallbackLabel(card.recommendationLabel)
      : foodTipFallbackLabel(card.recommendationLabel);
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
          ? card.recommendationLabel?.replace(/^Exhibition · /, "") ?? "Exhibition"
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
          imageUrl={card.imageUrl}
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
        imageUrl={card.imageUrl}
        eventType={eventType}
        placeholderLabel={posterPlaceholderLabel(card)}
        isVideo={isIgReel}
      />
      <div className="card__body">
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
              {card.recommendationLabel ?? "Exhibition"}
              {card.venueName ? ` · ${card.venueName}` : ""}
              {card.neighborhood ? ` · ${card.neighborhood}` : ""}
            </>
          ) : isTimeTba ? (
            <>
              {formatDayOnly(card.startsAt, timeZone)}
              {tbaWhen ? ` · ${tbaWhen}` : ""}
              {card.venueName ? ` · ${card.venueName}` : ""}
              {card.neighborhood ? ` · ${card.neighborhood}` : ""}
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
          {card.isFree ? " · Free" : ""}
        </div>
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
