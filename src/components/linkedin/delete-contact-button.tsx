"use client";

import { deleteContactAction } from "@/app/(app)/linkedin/[id]/actions";

/** Same confirm()-gated pattern as DeleteCompanyButton — a stray click can't fire it by accident. */
export default function DeleteContactButton({ contactId, contactName }: { contactId: string; contactName: string }) {
  return (
    <form
      action={deleteContactAction}
      onSubmit={(e) => {
        if (!confirm(`Permanently delete ${contactName}? This removes their whole history. This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={contactId} />
      <button
        type="submit"
        className="rounded-full border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/15"
      >
        Delete contact
      </button>
    </form>
  );
}
