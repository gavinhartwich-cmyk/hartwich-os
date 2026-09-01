import Link from "next/link";
import FormField from "@/components/form-field";
import { triggerLeadDiscoveryAction } from "./actions";

// Discovery keeps working after the redirect fires (via `after()` in the
// action) — this raises the platform's execution ceiling for that tail work
// as far as the Hobby/Free tier allows. Large target counts can still get
// cut short at the ceiling; whatever was found by then is already saved.
export const maxDuration = 60;

export default async function FindLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/leads/review" className="text-sm text-[var(--muted)] transition-colors hover:text-white">
          ← Review Queue
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Find leads</h1>
        <p className="text-sm text-[var(--muted)]">
          Kicks off a background search for HVAC companies in an area. Results land in the review
          queue (or straight on the board, for high-confidence matches) within a few minutes.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          Enter an area to search.
        </p>
      )}

      <form action={triggerLeadDiscoveryAction} className="space-y-4">
        <FormField label="Area" name="area" required autoFocus placeholder="Austin, TX" />
        <FormField label="Keyword" name="keyword" placeholder="HVAC contractor (default)" />
        <FormField
          label="How many qualified leads do you want?"
          name="targetCount"
          type="number"
          defaultValue="20"
          min={1}
          max={200}
          hint="If the area doesn't have enough, the search radius expands automatically — the quality bar never drops to make up the difference."
        />

        <button
          type="submit"
          className="btn-primary w-full"
        >
          Find Leads
        </button>
      </form>
    </div>
  );
}
