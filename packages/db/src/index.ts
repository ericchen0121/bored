import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolve } from "node:path";
import * as schema from "./schema.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const connectionString =
  process.env.DATABASE_URL ?? "postgres://bored:bored@localhost:5432/bored";

const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
export * from "./schema.js";
