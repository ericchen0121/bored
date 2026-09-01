"use client";

import {
  activityRecommendationLabel,
  activityTipFallbackLabel,
  categoryLabel,
  eventDetailImageUrl,
  eventHeroImageFit,
  eventOccurrencesOnLocalDay,
  eventScanTagsForDisplay,
  exhibitionScheduleFromPayload,
  exhibitionWhenLabel,
  foodDealRecommendationLabel,
  foodDealScheduleFromPayload,
  foodEditorialOutletLabel,
  foodRecommendationLabel,
  foodTipFallbackLabel,
  formatEventPriceLabel,
  genreTagsForDisplay,
  igFoodRecommendationLabel,
  isActivityRecommendationSource,
  isEvergreenRecommendationSource,
  isExhibitionTag,
  isFeedEventLive,
  isFoodDealSource,
  isFoodRecommendationSource,
  isInstagramVideo,
  isMusicListing,
  isNewRestaurantRecommendationSource,
  isSponsoredActive,
  isSportsListing,
  isTimeTbaTag,
  dailyHoursFromPayload,
  formatDailyHoursLabel,
  newRestaurantRecommendationLabel,
  newRestaurantTipFallbackLabel,
  parseLineupArtists,
  registrationStatusLabel,
  resolveEventOutboundDestinations,
  resolveSportsTeamRows,
  stripInfatuationRatingTitle,
  decodeHtmlEntities,
} from "@bored/shared";
import { artistListenLinks } from "@/lib/artist-listen";
import { formatDayOnly } from "@/lib/datetime";
import { cardEventType, posterPlaceholderLabel } from "@/lib/evergreen-poster";
import { DetailHeroMedia } from "@/components/EventPosterMedia";
import { LiveNowBadge } from "@/components/LiveNowBadge";
import { useNow } from "@/hooks/useNow";
import { eventOutboundHref } from "@/lib/outbound";
import { trackCtaClicked } from "@/lib/analytics";
import { SaveButton } from "@/components/SaveButton";
import { usePathname } from "next/navigation";
import { ListenPlatformIcon } from "./ListenPlatformIcon";
import { InstagramReelEmbed } from "./InstagramReelEmbed";
import { EventWeatherInline } from "./EventWeatherInline";
import { EventDetailLocation } from "./EventDetailLocation";
import type { EventDetail } from "./types";

function formatDetailPrice(event: EventDetail): string {
  return (
    formatEventPriceLabel({
      isFree: event.isFree,
      priceMin: event.priceMin,
      priceMax: event.priceMax,
      tags: event.tags,
      source: event.source,
      dollarPrice:
        typeof event.rawPayload?.dollarPrice === "number"
          ? event.rawPayload.dollarPrice
          : null,
    }) ?? "Price TBA"
  );
}

export function EventDetailContent({
  event,
  compact = false,
}: {
  event: EventDetail;
  compact?: boolean;
}) {
  const tz = event.timezone || "America/Los_Angeles";
  const pathname = usePathname();
  const now = useNow();
  const isExhibition = isExhibitionTag(event.tags);
  const isTimeTba = isTimeTbaTag(event.tags);
  const exhibitionSchedule = exhibitionScheduleFromPayload(event.rawPayload);
  const live = isFeedEventLive(event.startsAt, event.endsAt, now, {
    tags: event.tags,
    rawPayload: event.rawPayload,
  });
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
  const when = exhibitionSchedule
    ? exhibitionWhenLabel(exhibitionSchedule, tz)
    : isTimeTba
      ? (() => {
          const hours = dailyHoursFromPayload(event.rawPayload);
          const window = hours
            ? formatDailyHoursLabel(hours)
            : "Times vary";
          return `${formatDayOnly(event.startsAt, tz)} · ${window}`;
        })()
      : whenEnd
        ? `${whenStart} – ${whenEnd}`
        : whenStart;
  const occurrenceTimes = eventOccurrencesOnLocalDay({
    title: event.title,
    venueName: event.venueName,
    startsAt: startDate,
    timezone: tz,
    url: event.url,
    rawPayload: event.rawPayload,
  });
  const showOccurrenceTimes = occurrenceTimes.length > 1;

  const scanTags = eventScanTagsForDisplay(
    event.categories,
    event.tags,
    compact ? 8 : 12,
  );
  const genreChips = genreTagsForDisplay(event.tags, compact ? 8 : 12);
  const sports = isSportsListing({
    categories: event.categories,
    tags: event.tags,
    title: event.title,
    venueName: event.venueName,
    source: event.source,
  });
  const music = isMusicListing({
    categories: event.categories,
    tags: event.tags,
    title: event.title,
    venueName: event.venueName,
    source: event.source,
  });
  const lineup = music ? resolveLineupArtists(event) : [];
  const sportsTeams = sports
    ? resolveSportsTeamRows({
        title: event.title,
        rawPayload: event.rawPayload,
      })
    : [];
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

  const primaryCtaLabel = eventPrimaryCtaLabel({
    source: event.source,
    registrationStatus: event.registrationStatus,
    primaryUrl,
    eventDetailsUrl,
    sports,
    isReel: event.rawPayload?.mediaType === "REELS",
  });
  const secondaryCtaLabel = "Listing";

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
  const descriptionForDisplay = (() => {
    const raw =
      hasEditorialReview && event.description
        ? stripTrailingByline(stripLeadingHeadline(event.description, headline))
        : event.description
          ? stripLeadingHeadline(event.description, headline)
          : event.description;
    return raw ? decodeHtmlEntities(raw) : raw;
  })();
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
  const displayTitle = decodeHtmlEntities(
    isFoodTip
      ? event.source === "food"
        ? stripInfatuationRatingTitle(event.title, infatuationRating)
        : event.title
      : event.title,
  );
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
  const heroImageUrl = eventDetailImageUrl({
    source: event.source,
    imageUrl: event.imageUrl,
    rawPayload: event.rawPayload,
  });
  const heroImageFit =
    eventHeroImageFit({
      source: event.source,
      rawPayload: event.rawPayload,
    }) ?? undefined;
  const showSponsored = isSponsoredActive({
    isSponsored: event.isSponsored,
    sponsorEndsAt: event.sponsorEndsAt,
  });

  const whenBlock = isEvergreenTip ? null : showOccurrenceTimes ? (
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
  );

  return (
    <div className={`detail-body ${compact ? "is-compact" : ""}`}>
      {(showSponsored || infatuationRating != null) && (
        <div className="detail-body__meta-row">
          {showSponsored && <span className="badge sponsored">Sponsored</span>}
          {infatuationRating != null && (
            <span className="badge rating-infatuation">
              Infatuation {Number(infatuationRating).toFixed(1)}
            </span>
          )}
        </div>
      )}

      <header className="detail-body__header">
        <div className="detail-body__header-top">
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
                    : categoryLine || (event.isFree ? "Free" : "Event")}
            {event.isFree && categoryLine ? " · Free" : ""}
            {event.ageRestriction ? ` · ${event.ageRestriction}` : ""}
          </p>
          <SaveButton
            targetKind="event"
            targetId={event.id}
            returnTo={pathname || undefined}
            className="detail-body__save"
          />
        </div>
        <h2 className="detail-body__title">{displayTitle}</h2>
        {live && !isEvergreenTip ? (
          <p className="detail-body__live">
            <LiveNowBadge />
          </p>
        ) : null}
        {headline ? (
          <>
            <p className="lede detail-body__tagline">{headline}</p>
            {whenBlock}
          </>
        ) : (
          whenBlock
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
      ) : (
        <DetailHeroMedia
          imageUrl={heroImageUrl}
          fit={heroImageFit}
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
      )}

      <div className="panel detail-body__panel">
        {scanTags.length > 0 ? (
          <div className="tags detail-body__tags">
            {scanTags.map((t) => (
              <span key={t.id} className="badge genre">
                {t.label}
              </span>
            ))}
          </div>
        ) : null}
        {descriptionForDisplay && !descLooksLikeTags ? (
          <p className="detail-body__desc">{descriptionForDisplay}</p>
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
        {sportsTeams.length > 0 && (
          <div className="detail-body__lineup" style={{ marginTop: 14 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Teams
            </p>
            <p className="meta detail-body__lineup-hint">
              Official site and Instagram.
            </p>
            <ul className="detail-body__lineup-list">
              {sportsTeams.map((team) => (
                <li key={team.name} className="detail-body__lineup-artist">
                  <span className="detail-body__lineup-name">{team.name}</span>
                  {team.links.length > 0 ? (
                    <span className="detail-body__lineup-listen">
                      {team.links.map((link) => (
                        <a
                          key={link.kind}
                          className="detail-body__team-link"
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label}
                        </a>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {lineup.length > 0 && (
          <div className="detail-body__lineup detail-body__lineup--listen">
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Lineup
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

        {!isEvergreenTip ? (
          <section
            className="detail-body__weather-divider"
            aria-label="Weather during event"
          >
            {whenBlock ? (
              <div className="detail-body__weather-context">{whenBlock}</div>
            ) : null}
            <EventWeatherInline
              startsAt={event.startsAt}
              endsAt={event.endsAt}
              timezone={tz}
              lat={event.lat}
              lng={event.lng}
              venueName={event.venueName}
              title={event.title}
              address={event.address}
              city={typeof event.city === "string" ? event.city : null}
              neighborhood={event.neighborhood}
              placeLabel={
                event.neighborhood ||
                (typeof event.city === "string" ? event.city : null) ||
                event.venueName
              }
            />
          </section>
        ) : null}

        <EventDetailLocation event={event} />
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
            style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
          >
            {primaryHref && (
              <a
                className="btn primary"
                href={primaryHref}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackCtaClicked({
                    kind: "event",
                    id: event.id,
                    slot: "primary",
                    source: event.source,
                  })
                }
              >
                {primaryCtaLabel}
              </a>
            )}
            {secondaryHref && (
              <a
                className="detail-body__listing-link"
                href={secondaryHref}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackCtaClicked({
                    kind: "event",
                    id: event.id,
                    slot: "secondary",
                    source: event.source,
                  })
                }
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
  // Music only — sports/comedy attractions must not get Spotify listen links.
  if (
    !isMusicListing({
      categories: event.categories,
      tags: event.tags,
      title: event.title,
      venueName: event.venueName,
      source: event.source,
    })
  ) {
    return [];
  }

  const fromPayload = (event.rawPayload?.artists ?? []).filter(
    (a): a is string => typeof a === "string" && Boolean(a.trim()),
  );
  if (fromPayload.length) return fromPayload.map((a) => a.trim());

  return parseLineupArtists(event.title);
}

function eventPrimaryCtaLabel({
  source,
  registrationStatus,
  primaryUrl,
  eventDetailsUrl,
  sports,
  isReel,
}: {
  source: string;
  registrationStatus: string | null | undefined;
  primaryUrl: string | null;
  eventDetailsUrl: string | null;
  sports: boolean;
  isReel: boolean;
}): string {
  if (source === "luma") {
    if (registrationStatus === "sold_out") return "View event";
    if (registrationStatus === "waitlist") return "Join waitlist";
    return "Register";
  }
  if (source === "partiful") return "Register";
  if (source === "food" || source === "food_deals") return "Read review";
  if (source === "activities") return "Learn more";
  if (source === "instagram") return isReel ? "Watch reel" : "View on Instagram";
  if (source === "ra") return "Get tickets";
  if (
    sports &&
    (source === "ticketmaster" ||
      /ticketmaster\.|livenation\./i.test(primaryUrl ?? ""))
  ) {
    return "Get tickets";
  }
  if (source === "ticketmaster") return "Get tickets";
  if (source === "do312" && eventDetailsUrl) return "Event website";
  if (
    source === "funcheap" &&
    primaryUrl &&
    !/funcheap\.com/i.test(primaryUrl)
  ) {
    return "Event details";
  }
  return "Event details";
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
