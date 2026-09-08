ALTER TYPE "public"."message_status" ADD VALUE 'opened' BEFORE 'replied';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "account_index" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tracking_token" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounce_reason" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tracking_token_unique" UNIQUE("tracking_token");