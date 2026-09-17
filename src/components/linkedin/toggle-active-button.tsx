"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleActiveAction } from "@/app/(app)/linkedin/[id]/actions";

export default function ToggleActiveButton({ contactId, active }: { contactId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await toggleActiveAction(contactId, !active);
          router.refresh();
        })
      }
      disabled={pending}
      className={active ? "btn-secondary text-xs" : "btn-primary text-xs"}
    >
      {pending ? "Working…" : active ? "Archive (stop reminders)" : "Reactivate"}
    </button>
  );
}
