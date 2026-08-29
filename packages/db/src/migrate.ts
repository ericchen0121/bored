import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresOptions } from "./pg.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const connectionString =
  process.env.DATABASE_URL ?? "postgres://bored:bored@localhost:5432/bored";

/** packages/db/src → repo root /drizzle (committed SQL migrations) */
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle",
);

async function main() {
  const client = postgres(connectionString, {
    ...postgresOptions(connectionString),
    max: 1,
  });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  await client.end();
  console.log("Migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
