import Link from "next/link";
import { ExternalLink } from "lucide-react";
import PageHeader from "@/components/page-header";
import Reveal from "@/components/reveal";
import MarkFollowedUpButton from "@/components/linkedin/mark-followed-up-button";
import { listLinkedInContacts, type LinkedInContactSummary } from "@/lib/data/linkedin-contacts";
import { relativeDay } from "@/lib/linkedin/format";
import { addLinkedInContactAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "A LinkedIn profile link is required.",
  url: "That doesn't look like a linkedin.com/in/... profile link.",
  duplicate: "That profile is already being tracked.",
};

function ContactRow({ contact, showDue }: { contact: LinkedInContactSummary; showDue: boolean }) {
  return (
    <li className="surface-card surface-card-hover flex items-center justify-between gap-3 p-3">
      <Link href={`/linkedin/${contact.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90">{contact.name || "LinkedIn contact"}</p>
        <p className="truncate text-xs text-[var(--muted)]">
          {contact.companyName ? `${contact.companyName} · ` : ""}
          {contact.lastContactedAt ? `Last contacted ${relativeDay(contact.lastContactedAt)}` : "Not yet contacted"}
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={contact.linkedinUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost text-xs"
          title="Open LinkedIn profile"
        >
          Open profile <ExternalLink className="size-3.5" />
        </a>
        {showDue && <MarkFollowedUpButton contactId={contact.id} />}
      </div>
    </li>
  );
}

export default async function LinkedInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string }>;
}) {
  const { error, added } = await searchParams;
  const contacts = await listLinkedInContacts();

  const active = contacts.filter((c) => c.active);
  const due = active.filter((c) => c.followUpDue);
  const upcoming = active
    .filter((c) => !c.followUpDue)
    .sort((a, b) => (a.nextFollowUpDueAt?.getTime() ?? 0) - (b.nextFollowUpDueAt?.getTime() ?? 0));
  const archived = contacts.filter((c) => !c.active);

  return (
    <div>
      <PageHeader
        title="LinkedIn Outreach"
        subtitle="Manual, personal outreach — kept off the board on purpose. Paste a profile link once; this tells you when it's time for the next follow-up and gets you there in one click."
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-sm text-red-300">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      )}
      {added === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-sm text-emerald-300">
          Added — logged as messaged today.
        </p>
      )}

      <div className="surface-card mb-6 p-4">
        <p className="mb-3 text-sm font-medium text-white/90">Add a contact</p>
        <form action={addLinkedInContactAction} className="space-y-3">
          <input
            type="url"
            name="linkedinUrl"
            placeholder="https://www.linkedin.com/in/..."
            required
            autoFocus
            className="input-field"
          />
          <div className="grid grid-cols-2 gap-3">
            <input type="text" name="name" placeholder="Name (optional)" className="input-field" />
            <input type="text" name="companyName" placeholder="Company (optional)" className="input-field" />
          </div>
          <input type="text" name="notes" placeholder="Notes (optional)" className="input-field" />
          <button type="submit" className="btn-primary w-full">
            Add — marks as messaged today
          </button>
        </form>
      </div>

      <Reveal>
        <h2 className="mb-2 text-sm font-medium text-white/90">
          Needs a follow-up {due.length > 0 && <span className="text-[var(--muted)]">({due.length})</span>}
        </h2>
        {due.length === 0 ? (
          <p className="surface-card border-dashed p-4 text-sm text-[var(--muted)]">Nothing due right now.</p>
        ) : (
          <ul className="mb-6 space-y-2">
            {due.map((c) => (
              <ContactRow key={c.id} contact={c} showDue />
            ))}
          </ul>
        )}
      </Reveal>

      {upcoming.length > 0 && (
        <Reveal delay={60}>
          <h2 className="mb-2 mt-6 text-sm font-medium text-white/90">Everything else</h2>
          <ul className="space-y-2">
            {upcoming.map((c) => (
              <ContactRow key={c.id} contact={c} showDue={false} />
            ))}
          </ul>
        </Reveal>
      )}

      {archived.length > 0 && (
        <Reveal delay={120}>
          <h2 className="mb-2 mt-6 text-sm font-medium text-white/40">Archived ({archived.length})</h2>
          <ul className="space-y-2 opacity-50">
            {archived.map((c) => (
              <ContactRow key={c.id} contact={c} showDue={false} />
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  );
}
