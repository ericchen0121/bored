/** Static cron metadata — mirrors cli.ts until durable DB schedules (Phase 2). */

export type StaticIngestSchedule = {
  id: string;
  cron: string;
  label: string;
  scope: "phase1" | "all" | "adapters";
  adapterIds?: string[];
  description: string;
};

export const STATIC_INGEST_SCHEDULES: StaticIngestSchedule[] = [
  {
    id: "phase1_6h",
    cron: "0 */6 * * *",
    label: "Every 6 hours",
    scope: "phase1",
    description: "Core scrapers (Phase 1 adapters)",
  },
  {
    id: "all_daily",
    cron: "15 6 * * *",
    label: "Daily 06:15 UTC",
    scope: "all",
    description: "All adapters (Phase 2 + recurring)",
  },
  {
    id: "movies_3h",
    cron: "0 */3 * * *",
    label: "Every 3 hours",
    scope: "adapters",
    adapterIds: ["movies_tms"],
    description: "Movies TMS only",
  },
];
