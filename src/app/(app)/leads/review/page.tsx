import Link from "next/link";
import { listCompaniesByStatus } from "@/lib/data/companies";
import StatusBadge from "@/components/status-badge";
import { cityState } from "@/lib/utils/format";
import { promoteToBoardAction, disqualifyLeadAction } from "./actions";

export default async function ReviewQueuePage() {
  const companies = await listCompaniesByStatus("qualified");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Qualified Leads</h1>
          <p className="text-sm text-neutral-500">
            {companies.length} lead{companies.length === 1 ? "" : "s"} ready to reach out to
          </p>
        </div>
        <Link
          href="/leads/find"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          + Find Leads
        </Link>
      </div>

      {companies.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          No qualified leads yet — find leads to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {companies.map((company) => (
            <li
              key={company.id}
              className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/companies/${company.id}`} className="font-medium hover:underline">
                      {company.name}
                    </Link>
                    <StatusBadge status={company.status} />
                    {company.googleRating && (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                        {company.googleRating}★ ({company.googleReviewCount || 0} reviews)
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {cityState(company.city, company.state) ?? company.addressLine ?? "—"}
                    {company.contactTier && ` · Tier ${company.contactTier}`}
                  </p>
                  {company.qualificationReasoning && (
                    <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
                      {company.qualificationReasoning}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={promoteToBoardAction}>
                    <input type="hidden" name="companyId" value={company.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Move to board
                    </button>
                  </form>
                  <form action={disqualifyLeadAction}>
                    <input type="hidden" name="companyId" value={company.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
                    >
                      Disqualify
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
