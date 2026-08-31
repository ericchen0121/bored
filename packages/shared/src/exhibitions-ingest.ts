/**
 * Ingest-only exhibition finalization — uses node:crypto for stable ids.
 * Not exported from the main barrel (client-safe).
 */

import { createHash } from "node:crypto";
import { dayKey } from "./datetime";
import {
  discoverLaRunStartFromUrl,
  isExhibitionCandidate,
  runBoundsUtc,
  type ExhibitionSchedule,
} from "./exhibitions";

function stableHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

const MS_PER_DAY = 86400000;

const EXHIBITION_SOURCES = new Set(["dola", "do312"]);

export type ExhibitionCarrier = {
  source: string;
  sourceEventId: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  timezone?: string | null;
  venueName?: string | null;
  url?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  rawPayload?: unknown;
};

export type FinalizeExhibitionsResult<T extends ExhibitionCarrier> = {
  events: T[];
  orphanIds: string[];
};

/**
 * Collapse Do Stuff daily calendar slots into one durable exhibition row
 * per DoLA/Do312 numeric id (or title+venue fallback).
 */
export function finalizeDoStuffExhibitions<T extends ExhibitionCarrier>(
  rows: T[],
  source: string,
  timezone: string,
  scheduleByUrl?: Map<string, Partial<ExhibitionSchedule>>,
): FinalizeExhibitionsResult<T> {
  const regular: T[] = [];
  const groups = new Map<string, { rows: T[]; orphanIds: string[] }>();
  const orphanIds: string[] = [];

  for (const row of rows) {
    const payload =
      (row.rawPayload as Record<string, unknown> | null | undefined) ?? {};
    const doStuffId = payload.id;
    const detailsUrl =
      typeof payload.eventDetailsUrl === "string"
        ? payload.eventDetailsUrl
        : row.url;
    const candidate = isExhibitionCandidate({
      source: row.source,
      url: detailsUrl ?? row.url,
      description: row.description,
      categories: row.categories ?? [],
      title: row.title,
    });

    if (!candidate || !EXHIBITION_SOURCES.has(source)) {
      regular.push(row);
      continue;
    }

    const key =
      typeof doStuffId === "number"
        ? `${source}:dostuff:${doStuffId}`
        : `${source}:${row.title}:${row.venueName ?? ""}`;

    const group = groups.get(key) ?? { rows: [], orphanIds: [] };
    group.rows.push(row);
    group.orphanIds.push(row.sourceEventId);
    groups.set(key, group);
  }

  const exhibitions: T[] = [];

  for (const group of groups.values()) {
    if (!group.rows.length) continue;
    const canonical = [...group.rows].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    )[0]!;
    const payload =
      (canonical.rawPayload as Record<string, unknown> | null | undefined) ?? {};
    const doStuffId =
      typeof payload.id === "number" ? payload.id : null;
    const detailsUrl =
      typeof payload.eventDetailsUrl === "string"
        ? payload.eventDetailsUrl
        : canonical.url;

    const urlSchedule =
      detailsUrl && scheduleByUrl?.get(detailsUrl)
        ? scheduleByUrl.get(detailsUrl)!
        : null;

    const runStart =
      urlSchedule?.runStart ??
      discoverLaRunStartFromUrl(detailsUrl ?? canonical.url) ??
      dayKey(canonical.startsAt, timezone);

    let runEnd =
      urlSchedule?.runEnd ??
      dayKey(
        new Date(canonical.startsAt.getTime() + 180 * MS_PER_DAY),
        timezone,
      );

    if (runEnd < runStart) {
      const [y] = runStart.split("-").map(Number);
      const endParts = runEnd.split("-").map(Number);
      runEnd = `${(endParts[0] ?? y)! + 1}-${String(endParts[1]).padStart(2, "0")}-${String(endParts[2]).padStart(2, "0")}`;
    }

    const schedule: ExhibitionSchedule = {
      runStart,
      runEnd,
      dailyHours: urlSchedule?.dailyHours ?? null,
      doStuffId,
    };

    const stableId =
      doStuffId != null
        ? stableHash([source, "exhibition", String(doStuffId)])
        : stableHash([
            source,
            "exhibition",
            canonical.title,
            canonical.venueName ?? "",
          ]);

    const categories = new Set(canonical.categories ?? []);
    categories.add("arts");
    const tags = new Set(canonical.tags ?? []);
    tags.add("exhibition");
    tags.add(source);

    const { start: runStartInstant, end: runEndInstant } = runBoundsUtc(
      schedule,
      timezone,
    );

    exhibitions.push({
      ...canonical,
      sourceEventId: stableId,
      startsAt: runStartInstant,
      endsAt: runEndInstant,
      categories: [...categories],
      tags: [...tags],
      rawPayload: {
        ...payload,
        exhibition: schedule,
      },
    } as T);

    orphanIds.push(...group.orphanIds);
  }

  return { events: [...regular, ...exhibitions], orphanIds };
}
