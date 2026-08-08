import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data/companies";
import FormField from "@/components/form-field";
import StatusBadge from "@/components/status-badge";
import { createDealAction, updateCompanyAction } from "./actions";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/companies" className="text-sm text-neutral-500 hover:underline">
        ← Companies
      </Link>

      <div className="mt-1 mb-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold">{company.name}</h1>
        <StatusBadge status={company.status} />
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_260px]">
        <form action={updateCompanyAction} className="space-y-4">
          <input type="hidden" name="id" value={company.id} />
          <FormField label="Company name" name="name" required defaultValue={company.name} />
          <FormField label="Website" name="website" type="url" defaultValue={company.website} />
          <FormField label="Phone" name="phone" type="tel" defaultValue={company.phone} />
          <FormField label="Address" name="addressLine" defaultValue={company.addressLine} />
          <div className="grid grid-cols-3 gap-3">
            <FormField label="City" name="city" defaultValue={company.city} />
            <FormField label="State" name="state" defaultValue={company.state} />
            <FormField label="ZIP" name="postalCode" defaultValue={company.postalCode} />
          </div>
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={company.notes ?? ""}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Save changes
          </button>
        </form>

        <aside>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Deals</h2>
            <form action={createDealAction}>
              <input type="hidden" name="companyId" value={company.id} />
              <button type="submit" className="text-xs font-medium text-neutral-500 hover:underline">
                + New deal
              </button>
            </form>
          </div>

          <ul className="mt-3 space-y-2">
            {company.deals.length === 0 && (
              <li className="text-sm text-neutral-400">No deals yet.</li>
            )}
            {company.deals.map((deal) => (
              <li
                key={deal.id}
                className="rounded-md border border-neutral-200 p-2.5 text-sm dark:border-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      deal.stage.isWon
                        ? "font-medium text-emerald-700 dark:text-emerald-400"
                        : deal.stage.isLost
                          ? "font-medium text-neutral-400"
                          : "font-medium"
                    }
                  >
                    {deal.stage.name}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {deal.owner?.name ?? "Unassigned"} ·{" "}
                  {new Date(deal.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>

          <Link href="/board" className="mt-3 inline-block text-xs text-neutral-500 hover:underline">
            View on board →
          </Link>
        </aside>
      </div>
    </div>
  );
}
