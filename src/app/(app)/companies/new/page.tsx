import Link from "next/link";
import FormField from "@/components/form-field";
import { createCompanyAction } from "./actions";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/companies" className="text-sm text-neutral-500 hover:underline">
          ← Companies
        </Link>
        <h1 className="mt-1 text-xl font-semibold">New company</h1>
        <p className="text-sm text-neutral-500">
          Adds the company and drops it into the first pipeline stage.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          Company name is required.
        </p>
      )}

      <form action={createCompanyAction} className="space-y-4">
        <FormField label="Company name" name="name" required autoFocus />
        <FormField label="Website" name="website" type="url" placeholder="https://" />
        <FormField label="Phone" name="phone" type="tel" />
        <FormField label="Address" name="addressLine" />
        <div className="grid grid-cols-3 gap-3">
          <FormField label="City" name="city" />
          <FormField label="State" name="state" />
          <FormField label="ZIP" name="postalCode" />
        </div>
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Create company
        </button>
      </form>
    </div>
  );
}
