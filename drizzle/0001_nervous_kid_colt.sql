CREATE TYPE "public"."booking_question_type" AS ENUM('text', 'textarea', 'email', 'phone', 'select');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "booking_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"field_type" "booking_question_type" DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT true NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_window_days" integer DEFAULT 30 NOT NULL,
	"meeting_duration_minutes" integer DEFAULT 30 NOT NULL,
	"min_notice_hours" integer DEFAULT 4 NOT NULL,
	"timezone" text DEFAULT 'America/Winnipeg' NOT NULL,
	"working_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"working_hours_start" text DEFAULT '09:00' NOT NULL,
	"working_hours_end" text DEFAULT '17:00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"deal_id" uuid,
	"prospect_name" text NOT NULL,
	"prospect_email" text NOT NULL,
	"prospect_phone" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"google_event_id" text,
	"email_reminder_24h_sent_at" timestamp with time zone,
	"email_reminder_1h_sent_at" timestamp with time zone,
	"sms_reminder_24h_sent_at" timestamp with time zone,
	"sms_reminder_1h_sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- NOTE: tasks.duration_minutes/location/google_event_id/google_event_synced_at
-- already exist live (added by hand during the Phase 3/4 schema-drift fix,
-- which never got captured as a tracked migration). drizzle-kit generate
-- doesn't know that because it diffs against 0000's snapshot, not the live
-- DB, so those 4 ALTER TABLE statements were stripped from this migration
-- to avoid "column already exists" — the new 0001 snapshot below is still
-- correct, only the SQL text applied here is trimmed.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;