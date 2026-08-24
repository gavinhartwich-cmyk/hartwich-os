import Link from "next/link";
import { listCompaniesByStatus } from "@/lib/data/companies";
import StatusBadge from "@/components/status-badge";
import { cityState } from "@/lib/utils/format";
import { promoteToBoardAction, disqualifyLeadAction } from "./actions";
import DiscoveryProgress from "./discovery-progress";

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  const { runId } = await searchParams;
  const companies = await listCompaniesByStatus("qualified");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Qualified Leads</h1>
          <p className="text-sm text-[var(--muted)]">
            {companies.length} lead{companies.length === 1 ? "" : "s"} ready to reach out to
          </p>
        </div>
        <Link
          href="/leads/find"
          className="btn-primary"
        >
          + Find Leads
        </Link>
      </div>

      {runId && <DiscoveryProgress runId={runId} />}

      {companies.length === 0 ? (
        <p className="surface-card border-dashed p-6 text-sm text-[var(--muted)]">
          No qualified leads yet — find leads to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {companies.map((company) => (
            <li
              key={company.id}
              className="surface-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/companies/${company.id}`} className="font-medium hover:underline">
                      {company.name}
                    </Link>
                    <StatusBadge status={company.status} />
                    {company.googleRating && (
                      <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        {company.googleRating}★ ({company.googleReviewCount || 0} reviews)
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted-2)]">
                    {cityState(company.city, company.state) ?? company.addressLine ?? "—"}
                    {company.contactTier && ` · Tier ${company.contactTier}`}
                  </p>
                  {company.qualificationReasoning && (
                    <p className="mt-2 max-w-2xl text-sm text-white/70">
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
                      className="btn-secondary"
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
