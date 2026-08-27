import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../.env") });
config();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "../../drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://bored:bored@localhost:5432/bored",
  },
});
