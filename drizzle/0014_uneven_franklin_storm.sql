CREATE TABLE "daily_report_sends" (
	"date_key" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
