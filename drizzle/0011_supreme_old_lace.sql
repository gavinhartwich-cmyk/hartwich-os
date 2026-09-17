CREATE TABLE "linkedin_contact_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linkedin_url" text NOT NULL,
	"name" text,
	"company_name" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_contacts_linkedin_url_unique" UNIQUE("linkedin_url")
);
--> statement-breakpoint
ALTER TABLE "linkedin_contact_events" ADD CONSTRAINT "linkedin_contact_events_contact_id_linkedin_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."linkedin_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_contacts" ADD CONSTRAINT "linkedin_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;