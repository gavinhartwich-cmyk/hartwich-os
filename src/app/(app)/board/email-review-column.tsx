"use client";

import { useState } from "react";
import type { PendingEmailDraft } from "@/lib/data/email-drafts";

interface EmailReviewColumnProps {
  drafts: PendingEmailDraft[];
}

export default function EmailReviewColumn({ drafts }: EmailReviewColumnProps) {
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState<string | null>(null);
  const [draftList, setDraftList] = useState(drafts);

  async function handleApprove(draftId: string, userId: string) {
    setIsApproving(draftId);
    try {
      const res = await fetch("/api/emails/approve-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDraftId: draftId, userId }),
      });

      if (res.ok) {
        setDraftList((prev) => prev.filter((d) => d.id !== draftId));
      } else {
        const err = await res.json();
        alert(`Error: ${err.error} - ${err.reason || err.details}`);
      }
    } catch (error) {
      alert(`Failed to approve: ${error}`);
    } finally {
      setIsApproving(null);
    }
  }

  async function handleReject(draftId: string, userId: string, reason?: string) {
    setIsRejecting(draftId);
    try {
      const res = await fetch("/api/emails/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDraftId: draftId, userId, reason }),
      });

      if (res.ok) {
        setDraftList((prev) => prev.filter((d) => d.id !== draftId));
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (error) {
      alert(`Failed to reject: ${error}`);
    } finally {
      setIsRejecting(null);
    }
  }

  if (draftList.length === 0) {
    return null; // Hide section if no pending emails
  }

  // Get userId from somewhere - for now, use a placeholder
  const userId = "user-id-placeholder"; // TODO: Get from session/auth

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Email Review</h2>
        <span className="text-xs text-neutral-400">{draftList.length}</span>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg border border-dashed border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950">
        {draftList.map((draft) => (
          <div
            key={draft.id}
            className="rounded-md border border-amber-300 bg-white p-3 shadow-sm dark:border-amber-800 dark:bg-neutral-900"
          >
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                {draft.companyName}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                To: {draft.contactName} ({draft.contactEmail})
              </p>
              <p className="mt-1 text-xs font-medium text-neutral-700 dark:text-neutral-200">
                {draft.subject}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                {draft.body}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(draft.id, userId)}
                disabled={isApproving === draft.id || isRejecting === draft.id}
                className="flex-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isApproving === draft.id ? "Sending..." : "Approve"}
              </button>
              <button
                onClick={() => handleReject(draft.id, userId)}
                disabled={isApproving === draft.id || isRejecting === draft.id}
                className="flex-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isRejecting === draft.id ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
