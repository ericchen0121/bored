import {
  categoriesForActivityKind,
  CHI_DEFAULT,
  CURATED_ACTIVITIES,
  CURATED_ACTIVITY_IMAGES,
  LA_DEFAULT,
  SF_DEFAULT,
  suggestionStartsAt,
  type CuratedActivity,
} from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

function playKindFromTags(tags: string[] | undefined): string | null {
  const tag = tags?.find((t) => t.startsWith("play_kind:"));
  return tag ? tag.slice("play_kind:".length) : null;
}

const TIMEZONE_BY_CITY: Record<string, string> = {
  sf: SF_DEFAULT.timezone,
  chicago: CHI_DEFAULT.timezone,
  la: LA_DEFAULT.timezone,
};

function timezoneForCity(city: string): string {
  return TIMEZONE_BY_CITY[city] ?? SF_DEFAULT.timezone;
}

function materializeActivity(activity: CuratedActivity): NormalizedEvent {
  const sourceEventId = contentHash(["activities", activity.city, activity.id]);
  const categories =
    activity.categories ??
    categoriesForActivityKind(activity.activityKind, activity.tags);
  const tags = [
    "activity",
    activity.activityKind,
    activity.audience,
    ...(activity.tags ?? []),
  ];
  const imageUrl =
    activity.imageUrl ?? CURATED_ACTIVITY_IMAGES[activity.id] ?? null;

  return {
    source: "activities",
    sourceEventId,
    kind: "recommendation",
    title: activity.title,
    description: activity.description.slice(0, 1500),
    startsAt: suggestionStartsAt(sourceEventId, null),
    timezone: timezoneForCity(activity.city),
    venueName: activity.venueName ?? null,
    address: activity.address ?? null,
    neighborhood: activity.neighborhood ?? null,
    lat: activity.lat ?? null,
    lng: activity.lng ?? null,
    city: activity.city,
    isFree: activity.isFree ?? categories.includes("free"),
    categories,
    tags,
    url: activity.url ?? null,
    imageUrl,
    organizer: "Bored picks",
    rawPayload: {
      activityId: activity.id,
      audience: activity.audience,
      activityKind: activity.activityKind,
      playKind: playKindFromTags(activity.tags),
      imageSource: imageUrl ? "curated" : null,
    },
  };
}

/** Curated evergreen activities — parks, hikes, local gems (SF + Chicago). */
export const activitiesAdapter: SourceAdapter = {
  id: "activities",
  description: "Curated evergreen activities — hikes, parks, local gems",
  async fetch() {
    const events = CURATED_ACTIVITIES.map(materializeActivity);
    return { events, replaceForSource: "activities" };
  },
};

export { materializeActivity };
