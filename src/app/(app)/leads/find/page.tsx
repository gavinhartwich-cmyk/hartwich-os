import Link from "next/link";
import FormField from "@/components/form-field";
import { triggerLeadDiscoveryAction } from "./actions";

export default async function FindLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/leads/review" className="text-sm text-neutral-500 hover:underline">
          ← Review Queue
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Find leads</h1>
        <p className="text-sm text-neutral-500">
          Kicks off a background search for HVAC companies in an area. Results land in the review
          queue (or straight on the board, for high-confidence matches) within a few minutes.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          Enter an area to search.
        </p>
      )}

      <form action={triggerLeadDiscoveryAction} className="space-y-4">
        <FormField label="Area" name="area" required autoFocus placeholder="Austin, TX" />
        <FormField label="Keyword" name="keyword" placeholder="HVAC contractor (default)" />

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Find Leads
        </button>
      </form>
    </div>
  );
}
