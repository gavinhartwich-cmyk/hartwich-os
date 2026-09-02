CREATE TABLE "email_send_accounts" (
	"account_index" integer PRIMARY KEY NOT NULL,
	"warmup_status" text DEFAULT 'not_started' NOT NULL,
	"warmup_started_at" timestamp with time zone,
	"daily_send_count" integer DEFAULT 0 NOT NULL,
	"last_send_reset_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "warmup_status";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "warmup_started_at";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "daily_send_count";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "last_send_reset_at";