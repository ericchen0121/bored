import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const connectionString =
  process.env.DATABASE_URL ?? "postgres://bored:bored@localhost:5432/bored";

async function main() {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "../../drizzle") });
  await client.end();
  console.log("Migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
