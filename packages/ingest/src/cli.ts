import { config } from "dotenv";
import cron from "node-cron";
import { resolve } from "node:path";
import { ALL_ADAPTERS, PHASE1_ADAPTERS, runAll, runAdapter } from "./runner.js";
import { processNextIngestJob, startIngestJobPoller } from "./jobPoller.js";
import { STATIC_INGEST_SCHEDULES } from "./schedules.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const args = process.argv.slice(2);
const once = args.includes("--once");
const jobs = args.includes("--jobs");
const schedule = args.includes("--schedule");
const phase1 = args.includes("--phase1");
const backfillTicketImages = args.includes("--backfill-ticket-images");
const backfillSportsLinks = args.includes("--backfill-sports-links");
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

async function main() {
  if (backfillTicketImages) {
    const { runBackfillTicketImages } = await import(
      "./backfillTicketImages.js"
    );
    await runBackfillTicketImages(args);
    return;
  }

  if (backfillSportsLinks) {
    const { runBackfillSportsLinks } = await import("./backfillSportsLinks.js");
    await runBackfillSportsLinks(args);
    return;
  }

  const onlyIds = only
    ? only.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const adapters = onlyIds
    ? ALL_ADAPTERS.filter((a) => onlyIds.includes(a.id))
    : phase1
      ? PHASE1_ADAPTERS
      : ALL_ADAPTERS;

  if (jobs) {
    let processed = 0;
    while (await processNextIngestJob()) processed += 1;
    if (processed > 0) {
      console.log(`Processed ${processed} admin ingest job(s)`);
    }
    if (!once && !phase1 && !only && !schedule) {
      process.exit(0);
    }
  }

  if (!adapters.length) {
    console.error("No adapters matched");
    process.exit(1);
  }

  if (once || !schedule) {
    const total = await runAll(adapters);
    console.log(`Done. Total upserted: ${total}`);
    if (!schedule) process.exit(0);
  }

  console.log("Scheduling ingest jobs…");
  for (const entry of STATIC_INGEST_SCHEDULES) {
    cron.schedule(entry.cron, () => {
      if (entry.scope === "phase1") {
        void runAll(PHASE1_ADAPTERS);
        return;
      }
      if (entry.scope === "all") {
        void runAll(ALL_ADAPTERS);
        return;
      }
      const ids = new Set(entry.adapterIds ?? []);
      const matched = ALL_ADAPTERS.filter((a) => ids.has(a.id));
      for (const a of matched) void runAdapter(a);
    });
  }

  startIngestJobPoller();

  // Production: set INGEST_RUN_ON_BOOT=1 so the first deploy doesn't wait for cron.
  if (process.env.INGEST_RUN_ON_BOOT === "1") {
    console.log("INGEST_RUN_ON_BOOT=1 — running Phase 1 once…");
    void runAll(PHASE1_ADAPTERS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
