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
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Contacts</h2>

      <ul className="mt-3 space-y-2">
        {contacts.length === 0 && (
          <li className="text-sm text-neutral-400">No contacts yet.</li>
        )}
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="rounded-md border border-neutral-200 p-2.5 text-sm dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{contact.name || "Unnamed contact"}</span>
              {contact.isPrimary && (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  Primary
                </span>
              )}
            </div>
            {contact.title && <p className="text-xs text-neutral-500">{contact.title}</p>}
            {(contact.email || contact.phone) && (
              <p className="mt-1 space-x-2 text-xs text-neutral-400">
                {contact.email && <span>{contact.email}</span>}
                {contact.phone && <span>{contact.phone}</span>}
              </p>
            )}
            <div className="mt-2 flex gap-3">
              {!contact.isPrimary && (
                <form action={setPrimaryContactAction}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="contactId" value={contact.id} />
                  <button type="submit" className="text-xs text-neutral-500 hover:underline">
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
        <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:underline">
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
              className="rounded border-neutral-300 dark:border-neutral-700"
            />
            Primary contact
          </label>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Add contact
          </button>
        </form>
      </details>
    </section>
  );
}
