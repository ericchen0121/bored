import { config } from "dotenv";
import cron from "node-cron";
import { resolve } from "node:path";
import { ALL_ADAPTERS, PHASE1_ADAPTERS, runAll, runAdapter } from "./runner.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const args = process.argv.slice(2);
const once = args.includes("--once");
const schedule = args.includes("--schedule");
const phase1 = args.includes("--phase1");
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

async function main() {
  const onlyIds = only
    ? only.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const adapters = onlyIds
    ? ALL_ADAPTERS.filter((a) => onlyIds.includes(a.id))
    : phase1
      ? PHASE1_ADAPTERS
      : ALL_ADAPTERS;

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
  // Every 6 hours: core scrapers
  cron.schedule("0 */6 * * *", () => {
    void runAll(PHASE1_ADAPTERS);
  });
  // Daily: phase 2 + recurring
  cron.schedule("15 6 * * *", () => {
    void runAll(ALL_ADAPTERS);
  });
  // Movies more often when configured
  cron.schedule("0 */3 * * *", () => {
    const movies = ALL_ADAPTERS.find((a) => a.id === "movies_tms");
    if (movies) void runAdapter(movies);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
