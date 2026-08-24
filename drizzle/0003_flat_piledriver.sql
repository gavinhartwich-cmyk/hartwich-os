CREATE TYPE "public"."discovery_run_status" AS ENUM('running', 'completed', 'completed_partial', 'failed');--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"keyword" text NOT NULL,
	"target_count" integer NOT NULL,
	"found_count" integer DEFAULT 0 NOT NULL,
	"radius_miles" integer,
	"status" "discovery_run_status" DEFAULT 'running' NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;