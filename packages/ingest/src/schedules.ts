/** Static ingest schedules — source of truth for local `--schedule` and Railway cron services. */

export type StaticIngestSchedule = {
  id: string;
  cron: string;
  label: string;
  scope: "phase1" | "all" | "adapters";
  adapterIds?: string[];
  description: string;
  /** Railway cron service name (see `railway/ingest-<task>/railway.toml`). */
  railwayService?: string;
};

export const STATIC_INGEST_SCHEDULES: StaticIngestSchedule[] = [
  {
    id: "phase1_6h",
    cron: "0 */6 * * *",
    label: "Every 6 hours",
    scope: "phase1",
    description: "Core scrapers (Phase 1 adapters)",
    railwayService: "ingest-phase1",
  },
  {
    id: "all_daily",
    cron: "15 6 * * *",
    label: "Daily 06:15 UTC",
    scope: "all",
    description: "All adapters (Phase 2 + recurring)",
    railwayService: "ingest-daily",
  },
  {
    id: "movies_12h",
    cron: "0 */12 * * *",
    label: "Every 12 hours",
    scope: "adapters",
    adapterIds: ["indie_theater"],
    description: "Roxie calendar (indie_theater) showtimes",
    railwayService: "ingest-movies",
  },
];
