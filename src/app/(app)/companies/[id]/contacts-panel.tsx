import FormField from "@/components/form-field";
import type { Contact } from "@/lib/data/contacts";
import { createContactAction, deleteContactAction, setPrimaryContactAction } from "./actions";

export default function ContactsPanel({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: Contact[];
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-white/80">Contacts</h2>

      <ul className="mt-3 space-y-2">
        {contacts.length === 0 && (
          <li className="text-sm text-[var(--muted-2)]">No contacts yet.</li>
        )}
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="surface-card p-2.5 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{contact.name || "Unnamed contact"}</span>
              {contact.isPrimary && (
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/70">
                  Primary
                </span>
              )}
            </div>
            {contact.title && <p className="text-xs text-[var(--muted-2)]">{contact.title}</p>}
            {(contact.email || contact.phone) && (
              <p className="mt-1 space-x-2 text-xs text-[var(--muted-2)]">
                {contact.email && <span>{contact.email}</span>}
                {contact.phone && <span>{contact.phone}</span>}
              </p>
            )}
            <div className="mt-2 flex gap-3">
              {!contact.isPrimary && (
                <form action={setPrimaryContactAction}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="contactId" value={contact.id} />
                  <button type="submit" className="text-xs text-[var(--muted)] transition-colors hover:text-white">
                    Make primary
                  </button>
                </form>
              )}
              <form action={deleteContactAction}>
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="contactId" value={contact.id} />
                <button type="submit" className="text-xs text-red-500 hover:underline">
                  Remove
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--muted)] transition-colors hover:text-white">
          + Add contact
        </summary>
        <form action={createContactAction} className="mt-3 space-y-3">
          <input type="hidden" name="companyId" value={companyId} />
          <FormField label="Name" name="name" />
          <FormField label="Title" name="title" />
          <FormField label="Email" name="email" type="email" />
          <FormField label="Phone" name="phone" type="tel" />
          <FormField label="LinkedIn URL" name="linkedinUrl" type="url" placeholder="https://" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPrimary"
              className="rounded border-white/20 bg-white/[0.02]"
            />
            Primary contact
          </label>
          <button
            type="submit"
            className="btn-primary"
          >
            Add contact
          </button>
        </form>
      </details>
    </section>
  );
}
