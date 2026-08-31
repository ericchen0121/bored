ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "budget_tier" integer;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "budget_enabled" boolean DEFAULT false NOT NULL;

-- One-time backfill from legacy USD budget_max.
UPDATE "user_profiles"
SET
  "budget_enabled" = true,
  "budget_tier" = CASE
    WHEN "budget_max" >= 1 AND "budget_max" <= 4 THEN "budget_max"
    WHEN "budget_max" <= 20 THEN 1
    WHEN "budget_max" <= 45 THEN 2
    WHEN "budget_max" <= 100 THEN 3
    ELSE 4
  END
WHERE "budget_max" IS NOT NULL
  AND "budget_tier" IS NULL;
