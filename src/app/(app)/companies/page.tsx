import Link from "next/link";
import { listCompanies } from "@/lib/data/companies";
import { cityState } from "@/lib/utils/format";
import StatusBadge from "@/components/status-badge";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const companies = await listCompanies(q);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-light tracking-tight text-white">Companies</h1>
          <p className="text-sm text-[var(--muted)]">{companies.length} total</p>
        </div>
        <Link href="/companies/new" className="btn-primary">
          + New Company
        </Link>
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search companies by name..."
          className="input-field max-w-sm"
        />
      </form>

      {companies.length === 0 ? (
        <p className="surface-card border-dashed p-6 text-sm text-[var(--muted)]">
          {q ? `No companies match "${q}".` : "No companies yet — add your first one."}
        </p>
      ) : (
        <>
          {/* Card list on small screens — a table would force horizontal scroll on a phone. */}
          <ul className="space-y-2 md:hidden">
            {companies.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/companies/${company.id}`}
                  className="surface-card block p-3 transition-colors duration-150 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white/90">{company.name}</span>
                    <StatusBadge status={company.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {cityState(company.city, company.state) ?? "—"}
                    {" · "}
                    <span className="capitalize">{company.source.replace("_", " ")}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="surface-card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-white/40">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {companies.map((company) => (
                  <tr key={company.id} className="transition-colors duration-150 hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/companies/${company.id}`}
                        className="font-medium text-white/90 hover:underline"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--muted)]">
                      {cityState(company.city, company.state) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={company.status} />
                    </td>
                    <td className="px-4 py-2.5 capitalize text-[var(--muted)]">
                      {company.source.replace("_", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
