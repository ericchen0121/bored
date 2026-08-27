"use client";

import {
  activityRecommendationLabel,
  activityTipFallbackLabel,
  categoryLabel,
  eventOccurrences,
  foodDealRecommendationLabel,
  foodDealScheduleFromPayload,
  foodEditorialOutletLabel,
  foodRecommendationLabel,
  foodTipFallbackLabel,
  genreTagsForDisplay,
  igFoodRecommendationLabel,
  isActivityRecommendationSource,
  isEvergreenRecommendationSource,
  isFoodDealSource,
  isFoodRecommendationSource,
  isHappeningNow,
  isInstagramVideo,
  isNewRestaurantRecommendationSource,
  newRestaurantRecommendationLabel,
  newRestaurantTipFallbackLabel,
  parseLineupArtists,
  registrationStatusLabel,
  resolveEventOutboundDestinations,
  sourceLabel,
  stripInfatuationRatingTitle,
} from "@bored/shared";
import { artistListenLinks } from "@/lib/artist-listen";
import { formatDayOnly } from "@/lib/datetime";
import { cardEventType, posterPlaceholderLabel } from "@/lib/evergreen-poster";
import { DetailHeroMedia } from "@/components/EventPosterMedia";
import { LiveNowBadge } from "@/components/LiveNowBadge";
import { useNow } from "@/hooks/useNow";
import {
  eventHasLocation,
  googleMapsEmbedSrc,
  googleMapsLink,
} from "@/lib/event-location";
import { eventOutboundHref } from "@/lib/outbound";
import { ListenPlatformIcon } from "./ListenPlatformIcon";
import { InstagramReelEmbed } from "./InstagramReelEmbed";
import type { EventDetail } from "./types";

function formatDetailPrice(event: EventDetail): string {
  if (event.isFree) return "Free";

  // Infatuation-style ordinal $–$$$$ (never invent USD ranges from this scale)
  const fromTag = (event.tags ?? []).find((t) => /^price_\$+$/.test(t));
  if (fromTag) return fromTag.replace(/^price_/, "");

  const dollars = event.rawPayload?.dollarPrice;
  if (typeof dollars === "number" && dollars >= 1 && dollars <= 4) {
    return "$".repeat(dollars);
  }

  if (
    event.source === "food" &&
    event.priceMin != null &&
    event.priceMin >= 1 &&
    event.priceMin <= 4 &&
    event.priceMax === event.priceMin
  ) {
    return "$".repeat(event.priceMin);
  }

  if (event.priceMin != null) {
    return `$${event.priceMin}${
      event.priceMax && event.priceMax !== event.priceMin
        ? `–$${event.priceMax}`
        : ""
    }`;
  }
  return "Price TBA";
}

export function EventDetailContent({
  event,
  compact = false,
}: {
  event: EventDetail;
  compact?: boolean;
}) {
  const tz = event.timezone || "America/Los_Angeles";
  const now = useNow();
  const live = isHappeningNow(event.startsAt, event.endsAt, now);
  const startDate = new Date(event.startsAt);
  const endDate = event.endsAt ? new Date(event.endsAt) : null;
  const sameDay =
    endDate &&
    startDate.toLocaleDateString("en-US", { timeZone: tz }) ===
      endDate.toLocaleDateString("en-US", { timeZone: tz });

  const whenStart = startDate.toLocaleString("en-US", {
    weekday: compact ? "short" : "long",
    month: compact ? "short" : "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  const whenEnd =
    endDate && !Number.isNaN(endDate.getTime())
      ? endDate.toLocaleString(
          "en-US",
          sameDay
            ? { hour: "numeric", minute: "2-digit", timeZone: tz }
            : {
                weekday: compact ? "short" : "long",
                month: compact ? "short" : "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: tz,
              },
        )
      : null;
  const when = whenEnd ? `${whenStart} – ${whenEnd}` : whenStart;
  const occurrenceTimes = eventOccurrences({
    title: event.title,
    venueName: event.venueName,
    startsAt: startDate,
    timezone: tz,
    url: event.url,
    rawPayload: event.rawPayload,
  });
  const showOccurrenceTimes = occurrenceTimes.length > 1;

  const genreChips = genreTagsForDisplay(event.tags, compact ? 6 : 8);
  const lineup = resolveLineupArtists(event);
  const categoryLine = event.categories
    .filter((c) => {
      if (c === "free") return false;
      if (genreChips.length && c.startsWith("music.") && c !== "music.electronic") {
        return false;
      }
      return true;
    })
    .map((c) => categoryLabel(c))
    .join(" · ");

  const descLooksLikeTags =
    Boolean(event.description) &&
    genreChips.length > 0 &&
    (() => {
      const desc = event.description!.toLowerCase().replace(/\s+/g, " ").trim();
      const fromTags = (event.tags ?? [])
        .map((t) => t.toLowerCase())
        .join(" ");
      return (
        desc === (event.tags ?? []).join(", ").toLowerCase() ||
        desc === (event.tags ?? []).join(" / ").toLowerCase() ||
        desc.replace(/[,/|]+/g, " ").replace(/\s+/g, " ").trim() ===
          fromTags.replace(/\s+/g, " ")
      );
    })();

  const regLabel = registrationStatusLabel(event.registrationStatus);
  const regCopy =
    event.registrationStatus === "sold_out"
      ? "This event is sold out and no longer taking registrations."
      : event.registrationStatus === "waitlist"
        ? "Registration is full — waitlist only."
        : event.registrationStatus === "near_capacity"
          ? "Almost full — few spots left."
          : null;

  const eventDetailsUrl =
    typeof event.rawPayload?.eventDetailsUrl === "string"
      ? event.rawPayload.eventDetailsUrl.trim() || null
      : null;
  const { primary: primaryUrl, secondary: secondaryUrl } =
    resolveEventOutboundDestinations(event);
  const primaryHref = primaryUrl
    ? eventOutboundHref(event.id, "primary")
    : null;
  const secondaryHref = secondaryUrl
    ? eventOutboundHref(event.id, "secondary")
    : null;

  const primaryCtaLabel =
    event.source === "luma"
      ? event.registrationStatus === "sold_out"
        ? "View on Luma"
        : event.registrationStatus === "waitlist"
          ? "Join waitlist"
          : "Register"
      : event.source === "partiful"
        ? "View on Partiful"
        : event.source === "food" || event.source === "food_deals"
          ? "Read review"
          : event.source === "activities"
            ? "Learn more"
            : event.source === "instagram"
            ? event.rawPayload?.mediaType === "REELS"
              ? "Watch reel"
              : "View on Instagram"
            : event.source === "ra"
            ? "View on RA"
            : event.source === "funcheap" &&
                primaryUrl &&
                !/funcheap\.com/i.test(primaryUrl)
              ? "Event details"
              : event.source === "do312" && eventDetailsUrl
                ? "Event website"
                : event.source === "do312"
                  ? "View on Do312"
                  : "Open source";

  const secondaryCtaLabel =
    event.source === "do312"
      ? "View on Do312"
      : event.source === "funcheap"
        ? "View on Funcheap"
        : "View listing";

  const priceLine = formatDetailPrice(event);
  const author = event.rawPayload?.author?.trim() || null;
  const authorAvatarUrl = event.rawPayload?.authorAvatarUrl?.trim() || null;
  const publishedLabel = formatPublishedLabel(event.rawPayload?.published);
  const headline =
    typeof event.rawPayload?.headline === "string"
      ? event.rawPayload.headline.trim()
      : "";
  const isFoodTip = isFoodRecommendationSource(
    event.source,
    event.categories,
  );
  const isNewRestaurant = isNewRestaurantRecommendationSource(event.source);
  const isActivityTip = isActivityRecommendationSource(event.source);
  const isEvergreenTip = isEvergreenRecommendationSource(
    event.source,
    event.categories,
    event.kind,
  );
  const isFoodDeal = isFoodDealSource(event.source);
  const cuisineTags = (
    Array.isArray(event.rawPayload?.cuisines)
      ? event.rawPayload.cuisines
      : []
  ).filter((c): c is string => typeof c === "string" && Boolean(c.trim()));
  // Prefer cuisine chips from payload; fall back to non-noise tags like "japanese"
  const cuisineFromTags = isFoodTip
    ? (event.tags ?? []).filter(
        (t) =>
          ![
            "food",
            "instagram",
            "reel",
            "video",
            "infatuation",
            "found_sf",
            "eater_sf",
            "place",
            "profile",
            "nines",
            "bars",
          ].includes(t) && !/^price_\$+$/.test(t),
      )
    : [];
  const cuisines =
    cuisineTags.length > 0
      ? cuisineTags
      : cuisineFromTags.map((t) =>
          t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        );
  const showEditorByline = Boolean(author || authorAvatarUrl);
  const editorialOutlet = foodEditorialOutletLabel(
    typeof event.rawPayload?.outlet === "string"
      ? event.rawPayload.outlet
      : Array.isArray(event.rawPayload?.sources)
        ? String(event.rawPayload.sources[0] ?? "")
        : null,
  );
  const hasEditorialReview =
    isFoodTip || (isFoodDeal && (showEditorByline || editorialOutlet));
  const descriptionForDisplay =
    hasEditorialReview && event.description
      ? stripTrailingByline(stripLeadingHeadline(event.description, headline))
      : event.description
        ? stripLeadingHeadline(event.description, headline)
        : event.description;
  const foodMeta =
    isFoodTip || isFoodDeal
      ? [...cuisines, priceLine !== "Price TBA" ? priceLine : null].filter(
          Boolean,
        )
      : [];
  const reviewedLabel =
    isFoodTip || isFoodDeal
      ? formatPublishedLabel(event.rawPayload?.published)
      : null;
  const recommendationLabel = isFoodDeal
    ? foodDealRecommendationLabel({
        dealKind:
          event.rawPayload?.dealKind === "lunch" ? "lunch" : "happy_hour",
        sources: Array.isArray(event.rawPayload?.sources)
          ? event.rawPayload.sources
          : null,
        schedule: foodDealScheduleFromPayload(
          event.rawPayload as Record<string, unknown> | null,
        ),
      })
    : isNewRestaurant
      ? newRestaurantRecommendationLabel({
          rawPayload: event.rawPayload as {
            cuisine?: unknown;
            sources?: unknown;
            hook?: unknown;
          } | null,
        })
      : isActivityTip
        ? activityRecommendationLabel({
            rawPayload: event.rawPayload as {
              audience?: unknown;
              activityKind?: unknown;
              playKind?: unknown;
            } | null,
          })
        : isFoodTip
          ? event.source === "instagram"
            ? igFoodRecommendationLabel(
                typeof event.rawPayload?.handle === "string"
                  ? event.rawPayload.handle
                  : (event.organizer?.replace(/^@/, "") ?? "instagram"),
                typeof event.rawPayload?.mediaType === "string"
                  ? event.rawPayload.mediaType
                  : null,
              )
            : foodRecommendationLabel({
                tags: event.tags,
                rawPayload: event.rawPayload,
                description: event.description,
              })
          : null;
  const infatuationRating =
    (event.source === "food" || isFoodDeal || isNewRestaurant) &&
    typeof event.rawPayload?.rating === "number" &&
    event.rawPayload.rating > 0
      ? event.rawPayload.rating
      : null;
  const displayTitle = isFoodTip
    ? event.source === "food"
      ? stripInfatuationRatingTitle(event.title, infatuationRating)
      : event.title
    : event.title;
  const showInstagramReel =
    isInstagramVideo({
      source: event.source,
      tags: event.tags,
      rawPayload: event.rawPayload as
        | { mediaType?: unknown; foodTip?: unknown }
        | null
        | undefined,
    }) && Boolean(event.url);
  const instagramMediaUrl =
    typeof event.rawPayload?.mediaUrl === "string"
      ? event.rawPayload.mediaUrl
      : null;
  const hasLocation = eventHasLocation(event);
  const mapsEmbedSrc = hasLocation ? googleMapsEmbedSrc(event) : null;
  const mapsLink = hasLocation ? googleMapsLink(event) : null;

  return (
    <div className={`detail-body ${compact ? "is-compact" : ""}`}>
      <div className="detail-body__meta-row">
        <span className="badge source">{sourceLabel(event.source)}</span>
        {infatuationRating != null && (
          <span className="badge rating-infatuation">
            Infatuation {Number(infatuationRating).toFixed(1)}
          </span>
        )}
      </div>

      <header className="detail-body__header">
        <p className="eyebrow">
          {isFoodDeal
            ? recommendationLabel ?? "Food deal"
            : isNewRestaurant
              ? newRestaurantTipFallbackLabel(recommendationLabel)
              : isActivityTip
                ? recommendationLabel
                  ? recommendationLabel
                  : "Activity · Recommendation"
                : isFoodTip
                  ? recommendationLabel
                    ? recommendationLabel
                    : "Food · Recommendation"
                  : categoryLine || "Event"}
          {event.isFree
            ? categoryLine || isEvergreenTip
              ? " · Free"
              : "Free"
            : ""}
          {event.ageRestriction ? ` · ${event.ageRestriction}` : ""}
        </p>
        <h2 className="detail-body__title">{displayTitle}</h2>
        {live && !isEvergreenTip ? (
          <p className="detail-body__live">
            <LiveNowBadge />
          </p>
        ) : null}
        {headline ? (
          <>
            <p className="lede detail-body__tagline">{headline}</p>
            {!isEvergreenTip ? (
              showOccurrenceTimes ? (
                <div className="lede detail-body__when">
                  <p>{formatDayOnly(event.startsAt, tz)}</p>
                  <div className="times">
                    {occurrenceTimes.map((o) => (
                      <span key={o.startsAt} className="time">
                        {new Date(o.startsAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: tz,
                        })}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="lede detail-body__when">{when}</p>
              )
            ) : null}
          </>
        ) : isEvergreenTip ? null : showOccurrenceTimes ? (
          <div className="lede detail-body__when">
            <p>{formatDayOnly(event.startsAt, tz)}</p>
            <div className="times">
              {occurrenceTimes.map((o) => (
                <span key={o.startsAt} className="time">
                  {new Date(o.startsAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: tz,
                  })}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="lede detail-body__when">{when}</p>
        )}
        {(isFoodTip || isFoodDeal) && reviewedLabel ? (
          <p className="meta" style={{ marginTop: 6 }}>
            Reviewed {reviewedLabel}
          </p>
        ) : null}
        {regLabel &&
          event.registrationStatus &&
          event.registrationStatus !== "open" && (
            <p className="detail-body__reg">
              <span
                className={`badge registration status-${event.registrationStatus}`}
              >
                {regLabel}
              </span>
              {regCopy && (
                <span className="meta" style={{ marginLeft: 10 }}>
                  {regCopy}
                </span>
              )}
            </p>
          )}
      </header>

      {showInstagramReel && event.url ? (
        <InstagramReelEmbed
          permalink={event.url}
          title={displayTitle}
          posterUrl={event.imageUrl}
          mediaUrl={instagramMediaUrl}
        />
      ) : event.imageUrl || isEvergreenTip ? (
        <DetailHeroMedia
          imageUrl={event.imageUrl}
          eventType={cardEventType({
            categories: event.categories,
            tags: event.tags,
            venueName: event.venueName,
            source: event.source,
            kind: "event",
          })}
          placeholderLabel={posterPlaceholderLabel({
            source: event.source,
            categories: event.categories,
            tags: event.tags,
            venueName: event.venueName,
            kind: "event",
            recommendationLabel,
          })}
        />
      ) : null}

      <div className="panel detail-body__panel">
        {hasLocation ? (
          <div className="detail-body__location">
            {event.venueName ? (
              <p className="detail-body__venue-name">{event.venueName}</p>
            ) : null}
            <div className="detail-body__location-meta">
              {event.neighborhood ? (
                <span className="badge neighborhood">{event.neighborhood}</span>
              ) : null}
              {event.address ? (
                <span className="meta detail-body__address">{event.address}</span>
              ) : null}
            </div>
            {mapsEmbedSrc ? (
              <div className="detail-body__map-frame">
                <iframe
                  src={mapsEmbedSrc}
                  title={
                    event.venueName
                      ? `Map of ${event.venueName}`
                      : "Event location map"
                  }
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            ) : null}
            {mapsLink ? (
              <a
                className="detail-body__map-link"
                href={mapsLink}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            ) : null}
          </div>
        ) : null}
        {foodMeta.length > 0 ? (
          <p className="meta" style={{ marginTop: 8 }}>
            {foodMeta.join(" · ")}
          </p>
        ) : (
          <p className="meta" style={{ marginTop: 8 }}>
            {priceLine}
          </p>
        )}
        {lineup.length > 0 && (
          <div className="detail-body__lineup" style={{ marginTop: 14 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Lineup
            </p>
            <p className="meta detail-body__lineup-hint">
              Listen on Spotify, YouTube Music, or SoundCloud to see if
              you&apos;re into them.
            </p>
            <ul className="detail-body__lineup-list">
              {lineup.map((name) => (
                <li key={name} className="detail-body__lineup-artist">
                  <span className="detail-body__lineup-name">{name}</span>
                  <span className="detail-body__lineup-listen">
                    {artistListenLinks(name).map((link) => (
                      <a
                        key={link.platform}
                        className="detail-body__listen-link"
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Search ${name} on ${link.label}`}
                        title={link.label}
                      >
                        <ListenPlatformIcon platform={link.platform} />
                      </a>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {genreChips.length > 0 && (
          <div className="tags" style={{ marginTop: 12 }}>
            {genreChips.map((t) => (
              <span key={t.id} className="badge genre">
                {t.label}
              </span>
            ))}
          </div>
        )}
        {descriptionForDisplay && !descLooksLikeTags && (
          <p className="detail-body__desc">{descriptionForDisplay}</p>
        )}
        {showEditorByline && (
          <div className="detail-body__byline">
            {authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={authorAvatarUrl}
                alt=""
                className="detail-body__editor-avatar"
              />
            ) : (
              <span className="detail-body__editor-avatar is-fallback" aria-hidden />
            )}
            <div className="detail-body__byline-text">
              {author && (
                <p className="detail-body__editor-name">
                  {author}
                  {editorialOutlet ? ` · ${editorialOutlet}` : ""}
                </p>
              )}
              {!author && editorialOutlet ? (
                <p className="detail-body__editor-name">{editorialOutlet}</p>
              ) : null}
              {publishedLabel && (
                <p className="meta detail-body__editor-date">{publishedLabel}</p>
              )}
            </div>
          </div>
        )}
        {(primaryHref || secondaryHref) && (
          <p
            className="detail-body__actions"
            style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
          >
            {primaryHref && (
              <a
                className="btn primary"
                href={primaryHref}
                target="_blank"
                rel="noreferrer"
              >
                {primaryCtaLabel}
              </a>
            )}
            {secondaryHref && (
              <a
                className="btn"
                href={secondaryHref}
                target="_blank"
                rel="noreferrer"
              >
                {secondaryCtaLabel}
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function formatPublishedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function resolveLineupArtists(event: EventDetail): string[] {
  const fromPayload = (event.rawPayload?.artists ?? []).filter(
    (a): a is string => typeof a === "string" && Boolean(a.trim()),
  );
  if (fromPayload.length) return fromPayload.map((a) => a.trim());

  const isMusic =
    event.source === "ra" ||
    event.source === "19hz" ||
    event.categories.some((c) => c.startsWith("music."));
  if (!isMusic) return [];

  return parseLineupArtists(event.title);
}

function stripTrailingByline(description: string): string {
  return description.replace(/\n*—\s+.+\s*$/u, "").trimEnd();
}

function stripLeadingHeadline(description: string, headline: string): string {
  if (!headline) return description;
  const trimmed = description.trimStart();
  if (trimmed.startsWith(headline)) {
    return trimmed.slice(headline.length).replace(/^\n+/, "").trimStart();
  }
  return description;
}
