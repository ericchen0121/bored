CREATE TABLE IF NOT EXISTS "ig_creator_scrapes" (
	"handle" varchar(64) PRIMARY KEY NOT NULL,
	"last_scraped_at" timestamp with time zone NOT NULL,
	"last_ok" boolean DEFAULT false NOT NULL,
	"last_http_status" integer,
	"last_error" text,
	"media_fetched" integer DEFAULT 0 NOT NULL,
	"events_emitted" integer DEFAULT 0 NOT NULL,
	"profile_picture_url" text
);
