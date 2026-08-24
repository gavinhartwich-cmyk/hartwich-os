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
        <Link href="/companies" className="text-sm text-[var(--muted)] hover:text-white/80 hover:underline">
          ← Companies
        </Link>
        <h1 className="mt-1 text-xl font-light tracking-tight text-white">New company</h1>
        <p className="text-sm text-[var(--muted)]">
          Adds the company and drops it into the first pipeline stage.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-sm text-red-300">
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
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-white/80">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} className="input-field" />
        </div>

        <button type="submit" className="btn-primary w-full">
          Create company
        </button>
      </form>
    </div>
  );
}
