"use client";

import { useState } from "react";
import type { PendingEmailDraft } from "@/lib/data/email-drafts";

interface EmailReviewColumnProps {
  drafts: PendingEmailDraft[];
  currentUserId: string;
}

export default function EmailReviewColumn({ drafts, currentUserId }: EmailReviewColumnProps) {
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

  const userId = currentUserId;

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-amber-300">Email Review</h2>
        <span className="text-xs text-white/30">{draftList.length}</span>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-amber-400/25 bg-amber-400/[0.04] p-2">
        {draftList.map((draft) => (
          <div key={draft.id} className="surface-card border-amber-400/15 p-3">
            <div className="mb-2">
              <p className="text-xs font-medium text-white/70">{draft.companyName}</p>
              <p className="text-xs text-[var(--muted)]">
                To: {draft.contactName} ({draft.contactEmail})
              </p>
              <p className="mt-1 text-xs font-medium text-white/85">{draft.subject}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{draft.body}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(draft.id, userId)}
                disabled={isApproving === draft.id || isRejecting === draft.id}
                className="flex-1 rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25 transition-colors duration-200 hover:bg-emerald-400/25 disabled:opacity-50"
              >
                {isApproving === draft.id ? "Sending..." : "Approve"}
              </button>
              <button
                onClick={() => handleReject(draft.id, userId)}
                disabled={isApproving === draft.id || isRejecting === draft.id}
                className="flex-1 rounded-full bg-red-400/15 px-2 py-1 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-400/25 transition-colors duration-200 hover:bg-red-400/25 disabled:opacity-50"
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
