/**
 * Mark the current committed /drizzle migration as applied without running SQL.
 * Use once on a DB that was created with `pnpm db:push` (local) so `pnpm db:migrate` is a no-op.
 * Fresh Railway DBs should run migrate normally — do not baseline them.
 *
 * Usage: pnpm --filter @bored/db exec tsx src/baselineMigrations.ts
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { postgresOptions } from "./pg.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const connectionString =
  process.env.DATABASE_URL ?? "postgres://bored:bored@localhost:5432/bored";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const journal = JSON.parse(
  readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8"),
) as { entries: { tag: string; when: number }[] };

async function main() {
  const client = postgres(connectionString, {
    ...postgresOptions(connectionString),
    max: 1,
  });

  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  for (const entry of journal.entries) {
    const body = readFileSync(resolve(root, `drizzle/${entry.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(body).digest("hex");
    const existing = await client`
      SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${hash} LIMIT 1
    `;
    if (existing.length) {
      console.log(`skip ${entry.tag} (already applied)`);
      continue;
    }
    await client`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
    console.log(`baselined ${entry.tag}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
