"use client";

import { useState, useTransition } from "react";
import { markFollowedUpAction } from "@/app/(app)/linkedin/actions";

/** Inline action on the due list — logs a follow-up with no note (a quick "just sent it") without leaving the page. Add a note later from the contact's own page if it matters. */
export default function MarkFollowedUpButton({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs text-emerald-300">Logged ✓</span>;
  }

  return (
    <button
      onClick={() => startTransition(async () => {
        await markFollowedUpAction(contactId);
        setDone(true);
      })}
      disabled={pending}
      className="btn-secondary text-xs"
    >
      {pending ? "Logging…" : "Mark followed up"}
    </button>
  );
}
