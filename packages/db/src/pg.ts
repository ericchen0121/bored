/** Shared Postgres connection options for API, migrate, and ingest. */

export function postgresOptions(connectionString: string): {
  max: number;
  ssl?: "require";
} {
  const remote =
    process.env.DATABASE_SSL === "1" ||
    process.env.DATABASE_SSL === "true" ||
    /sslmode=require/i.test(connectionString) ||
    /\.railway\.app|rlwy\.net|neon\.tech|supabase\.co|amazonaws\.com/i.test(
      connectionString,
    );

  return {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ...(remote ? { ssl: "require" as const } : {}),
  };
}
