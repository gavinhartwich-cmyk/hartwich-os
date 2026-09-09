CREATE TYPE "public"."email_draft_kind" AS ENUM('cold_outreach', 'follow_up', 'bounce_correction', 'reply');--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "last_outbound_email_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "last_inbound_email_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "follow_up_flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD COLUMN "kind" "email_draft_kind" DEFAULT 'cold_outreach' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD COLUMN "in_reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tracking_token" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "rfc822_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "account_index" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "open_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bounce_reason" text;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_in_reply_to_message_id_messages_id_fk" FOREIGN KEY ("in_reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tracking_token_unique" UNIQUE("tracking_token");