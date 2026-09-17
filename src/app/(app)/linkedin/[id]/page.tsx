import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import PageHeader from "@/components/page-header";
import FormField from "@/components/form-field";
import ToggleActiveButton from "@/components/linkedin/toggle-active-button";
import DeleteContactButton from "@/components/linkedin/delete-contact-button";
import { getLinkedInContact } from "@/lib/data/linkedin-contacts";
import { relativeDay } from "@/lib/linkedin/format";
import { deleteEventAction, logFollowUpAction, updateContactAction } from "./actions";

export default async function LinkedInContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getLinkedInContact(id);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/linkedin" className="text-sm text-[var(--muted)] hover:text-white/80 hover:underline">
        ← LinkedIn Outreach
      </Link>

      <PageHeader
        title={contact.name || "LinkedIn contact"}
        subtitle={contact.companyName ?? undefined}
        action={
          <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="btn-primary">
            Open profile <ExternalLink className="size-4" />
          </a>
        }
      />

      {contact.followUpDue && (
        <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-sm text-amber-300">
          Follow-up due {contact.nextFollowUpDueAt ? relativeDay(contact.nextFollowUpDueAt) : ""} — send it on LinkedIn, then log it below.
        </p>
      )}
      {!contact.active && (
        <p className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-[var(--muted)]">
          Archived — no longer reminding you about this one.
        </p>
      )}

      <div className="surface-card mb-6 p-4">
        <p className="mb-3 text-sm font-medium text-white/90">Log a follow-up</p>
        <form action={logFollowUpAction} className="flex gap-2">
          <input type="hidden" name="contactId" value={contact.id} />
          <input type="text" name="note" placeholder="What did you say? (optional)" className="input-field flex-1" />
          <button type="submit" className="btn-primary shrink-0">
            Log now
          </button>
        </form>
      </div>

      <div className="surface-card mb-6 p-4">
        <p className="mb-3 text-sm font-medium text-white/90">Details</p>
        <form action={updateContactAction} className="space-y-3">
          <input type="hidden" name="id" value={contact.id} />
          <FormField label="Name" name="name" defaultValue={contact.name} />
          <FormField label="Company" name="companyName" defaultValue={contact.companyName} />
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-white/80">
              Notes
            </label>
            <textarea id="notes" name="notes" rows={3} defaultValue={contact.notes ?? ""} className="input-field" />
          </div>
          <button type="submit" className="btn-secondary">
            Save
          </button>
        </form>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-white/90">History</p>
        <ToggleActiveButton contactId={contact.id} active={contact.active} />
      </div>
      <ul className="mb-6 space-y-2">
        {contact.events.map((event) => (
          <li key={event.id} className="surface-card flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm text-white/80">{relativeDay(event.occurredAt)}</p>
              {event.note && <p className="truncate text-xs text-[var(--muted)]">{event.note}</p>}
            </div>
            <form action={deleteEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="contactId" value={contact.id} />
              <button type="submit" className="text-xs text-[var(--muted)] hover:text-red-300">
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/[0.08] pt-4">
        <DeleteContactButton contactId={contact.id} contactName={contact.name || "this contact"} />
      </div>
    </div>
  );
}
