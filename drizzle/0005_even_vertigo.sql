ALTER TABLE "pipeline_stages" ADD COLUMN "is_contacted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: flag whichever existing stage is literally named "Contacted"
-- so the deal-auto-advance feature keeps working immediately after this
-- migration, with no manual step. This is a one-time bridge from the old
-- name-based matching to the new isContacted flag — rename the column
-- freely after this, or flip the flag onto a different stage by hand
-- (UPDATE pipeline_stages SET is_contacted = true WHERE id = '...') if
-- your pipeline's structure changes; there's no admin UI for it yet.
UPDATE "pipeline_stages" SET "is_contacted" = true WHERE lower("name") = 'contacted';