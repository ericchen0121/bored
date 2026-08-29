import { db, ingestJobs } from "@bored/db";
import { asc, eq } from "drizzle-orm";
import { ALL_ADAPTERS, PHASE1_ADAPTERS, runAdapter, runAll } from "./runner.js";

const POLL_MS = 30_000;

async function claimNextJob() {
  const [pending] = await db
    .select()
    .from(ingestJobs)
    .where(eq(ingestJobs.status, "pending"))
    .orderBy(asc(ingestJobs.requestedAt))
    .limit(1);
  if (!pending) return null;

  const [claimed] = await db
    .update(ingestJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(ingestJobs.id, pending.id))
    .returning();
  return claimed ?? null;
}

export async function processNextIngestJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    let adapters = ALL_ADAPTERS;
    if (job.scope === "phase1") {
      adapters = PHASE1_ADAPTERS;
    } else if (job.scope === "adapters") {
      const ids = new Set(job.adapterIds ?? []);
      adapters = ALL_ADAPTERS.filter((a) => ids.has(a.id));
      if (!adapters.length) {
        throw new Error(
          `No adapters matched: ${(job.adapterIds ?? []).join(",") || "(empty)"}`,
        );
      }
    } else if (job.scope !== "all") {
      throw new Error(`Unknown job scope: ${job.scope}`);
    }

    if (adapters.length === 1) {
      await runAdapter(adapters[0]!);
    } else {
      await runAll(adapters);
    }

    await db
      .update(ingestJobs)
      .set({ status: "ok", finishedAt: new Date(), error: null })
      .where(eq(ingestJobs.id, job.id));
    console.log(`[ingest_jobs] ok ${job.id} scope=${job.scope}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestJobs)
      .set({ status: "error", finishedAt: new Date(), error: message })
      .where(eq(ingestJobs.id, job.id));
    console.error(`[ingest_jobs] error ${job.id}:`, message);
  }
  return true;
}

/** Poll pending admin jobs while the schedule process is alive. */
export function startIngestJobPoller(): void {
  console.log(`Polling ingest_jobs every ${POLL_MS / 1000}s…`);
  const tick = () => {
    void processNextIngestJob().catch((err) => {
      console.error("[ingest_jobs] poll error:", err);
    });
  };
  tick();
  setInterval(tick, POLL_MS);
}
