ALTER TABLE "email_send_accounts" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "email_send_accounts" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "email_send_accounts" ADD COLUMN "token_expires_at" timestamp with time zone;