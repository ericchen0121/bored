CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(64) NOT NULL,
	"source_event_id" varchar(255) NOT NULL,
	"kind" varchar(32) DEFAULT 'event' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" varchar(64) DEFAULT 'America/Los_Angeles' NOT NULL,
	"venue_name" text,
	"address" text,
	"neighborhood" varchar(120),
	"lat" double precision,
	"lng" double precision,
	"city" varchar(64) DEFAULT 'sf' NOT NULL,
	"price_min" integer,
	"price_max" integer,
	"is_free" boolean DEFAULT false NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"age_restriction" text,
	"url" text,
	"image_url" text,
	"organizer" text,
	"recurring_show_id" uuid,
	"registration_status" varchar(32),
	"registration_checked_at" timestamp with time zone,
	"is_sponsored" boolean DEFAULT false NOT NULL,
	"sponsor_id" uuid,
	"boost_weight" double precision DEFAULT 1 NOT NULL,
	"sponsor_ends_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb,
	"content_hash" varchar(64) NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "films" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"runtime_minutes" integer,
	"mpaa" varchar(16),
	"synopsis" text,
	"tmdb_id" integer,
	"imdb_id" varchar(32),
	"poster_url" text,
	"backdrop_url" text,
	"trailer_youtube_id" varchar(32),
	"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"letterboxd_url" text,
	"rt_url" text,
	"rt_consensus" text,
	"reviews" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(32) NOT NULL,
	"adapter_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"requested_by" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adapter_id" varchar(64) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"items_upserted" integer DEFAULT 0,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "outbound_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"slot" varchar(32) DEFAULT 'primary' NOT NULL,
	"destination_host" varchar(255),
	"affiliate_network" varchar(64),
	"city" varchar(64),
	"source" varchar(64),
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_shows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"venue_name" text NOT NULL,
	"neighborhood" varchar(120),
	"address" text,
	"weekday" integer,
	"nth_weekday" integer,
	"hour" integer NOT NULL,
	"minute" integer DEFAULT 0 NOT NULL,
	"price_hint" varchar(80),
	"comedy_subtype" varchar(40) NOT NULL,
	"source_url" text,
	"trust_weight" double precision DEFAULT 0.8 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"city" varchar(32) DEFAULT 'sf' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "showtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"theater_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"format" varchar(64),
	"ticket_url" text,
	"source" varchar(40) DEFAULT 'tms' NOT NULL,
	"source_showtime_id" varchar(255),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_kind" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"metro" varchar(32) DEFAULT 'sf' NOT NULL,
	"package" varchar(40) DEFAULT 'venue_boost' NOT NULL,
	"contact_email" varchar(255),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theaters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"chain" varchar(120),
	"address" text,
	"neighborhood" varchar(120),
	"lat" double precision,
	"lng" double precision,
	"source_theatre_id" varchar(120)
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"neighborhoods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_max" integer,
	"prefer_free" boolean DEFAULT false,
	"nights_out" boolean DEFAULT true,
	"radius_miles" integer DEFAULT 15,
	"lat" double precision,
	"lng" double precision,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"display_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_theater_id_theaters_id_fk" FOREIGN KEY ("theater_id") REFERENCES "public"."theaters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_source_event_id_idx" ON "events" USING btree ("source","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "films_tmdb_id_idx" ON "films" USING btree ("tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "films_imdb_id_idx" ON "films" USING btree ("imdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "showtimes_source_showtime_id_idx" ON "showtimes" USING btree ("source","source_showtime_id");--> statement-breakpoint
CREATE UNIQUE INDEX "theaters_source_theatre_id_idx" ON "theaters" USING btree ("source_theatre_id");