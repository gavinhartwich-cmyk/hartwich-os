ALTER TABLE "companies" ADD COLUMN "website_summary" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "services_offered" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "apparent_size" text;