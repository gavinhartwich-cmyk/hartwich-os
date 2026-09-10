"use client";

import { deleteCompanyAction } from "./actions";

/**
 * Permanently deletes the company (and everything under it — contacts,
 * deals, activities, drafts) — see deleteCompany in lib/data/companies.ts.
 * Gated behind a native confirm() naming the company, same pattern the
 * /cleanup page already uses for its bulk delete, so a stray click can't
 * fire it by accident.
 */
export default function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  return (
    <form
      action={deleteCompanyAction}
      onSubmit={(e) => {
        if (!confirm(`Permanently delete ${companyName}? This removes its contacts, deals, and activity history too. This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <button
        type="submit"
        className="rounded-full border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/15"
      >
        Delete company
      </button>
    </form>
  );
}
