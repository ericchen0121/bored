import type { FeedArea } from "@bored/shared";

/** Metro-flavored feed loading line (see docs/city-seeding.md). */
export function gatheringPhraseForArea(area: FeedArea): string {
  return area === "chicago" ? "Gathering the wind…" : "Gathering the fog…";
}
