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
          <h1 className="text-xl font-semibold">Companies</h1>
          <p className="text-sm text-neutral-500">{companies.length} total</p>
        </div>
        <Link
          href="/companies/new"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          + New Company
        </Link>
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search companies by name..."
          className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </form>

      {companies.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          {q ? `No companies match "${q}".` : "No companies yet — add your first one."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <td className="px-4 py-2.5">
                    <Link href={`/companies/${company.id}`} className="font-medium hover:underline">
                      {company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">
                    {cityState(company.city, company.state) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={company.status} />
                  </td>
                  <td className="px-4 py-2.5 capitalize text-neutral-500">
                    {company.source.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
