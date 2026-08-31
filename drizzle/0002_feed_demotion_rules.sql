CREATE TABLE IF NOT EXISTS "feed_demotion_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"metro" varchar(32),
	"source" varchar(64),
	"venue_contains" text,
	"category_contains" text,
	"score_multiplier" double precision DEFAULT 0.35 NOT NULL,
	"max_per_venue" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "feed_demotion_rules" (
	"name",
	"metro",
	"source",
	"venue_contains",
	"category_contains",
	"score_multiplier",
	"max_per_venue",
	"notes",
	"active"
)
SELECT
	'The Function (Funcheap comedy)',
	'sf',
	NULL,
	'the function',
	NULL,
	0.3,
	1,
	'Venue owned by Funcheap — keep listings but do not feature them.',
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "feed_demotion_rules"
	WHERE lower("venue_contains") = 'the function'
);
