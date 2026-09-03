CREATE TABLE IF NOT EXISTS "ig_creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" varchar(64) NOT NULL,
	"city" varchar(32) NOT NULL,
	"categories" jsonb DEFAULT '["food"]'::jsonb NOT NULL,
	"food_influencer" boolean DEFAULT true NOT NULL,
	"city_guide" boolean DEFAULT false NOT NULL,
	"local_outlet" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ig_creators_handle_unique_idx" ON "ig_creators" USING btree ("handle");
