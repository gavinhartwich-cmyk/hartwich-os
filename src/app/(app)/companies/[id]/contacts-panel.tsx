import FormField from "@/components/form-field";
import type { Contact } from "@/lib/data/contacts";
import {
  createContactAction,
  deleteContactAction,
  findOwnerViaApolloAction,
  findOwnerViaSearchAction,
  setPrimaryContactAction,
} from "./actions";

const SOURCE_LABELS: Record<Contact["source"], string> = {
  apollo: "via Apollo · LinkedIn",
  google_places: "from discovery",
  manual: "manual",
};

function bbbSearchUrl(name: string, city: string | null, state: string | null): string {
  const params = new URLSearchParams({ find_text: name });
  const loc = [city, state].filter(Boolean).join(", ");
  if (loc) params.set("find_loc", loc);
  return `https://www.bbb.org/search?${params.toString()}`;
}

function linkedinSearchUrl(name: string): string {
  return `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(name)}`;
}

export default function ContactsPanel({
  companyId,
  companyName,
  companyCity,
  companyState,
  hasWebsite,
  apolloConfigured,
  tavilyConfigured,
  contacts,
  ownerLookupMessage,
}: {
  companyId: string;
  companyName: string;
  companyCity: string | null;
  companyState: string | null;
  hasWebsite: boolean;
  apolloConfigured: boolean;
  tavilyConfigured: boolean;
  contacts: Contact[];
  ownerLookupMessage?: { tone: "ok" | "muted"; text: string };
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-white/80">Contacts</h2>

      {ownerLookupMessage && (
        <p
          className={
            ownerLookupMessage.tone === "ok"
              ? "mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400"
              : "mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-[var(--muted-2)]"
          }
        >
          {ownerLookupMessage.text}
        </p>
      )}

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
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-[var(--muted-2)]">
                  {SOURCE_LABELS[contact.source]}
                </span>
                {contact.isPrimary && (
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/70">
                    Primary
                  </span>
                )}
              </div>
            </div>
            {contact.title && <p className="text-xs text-[var(--muted-2)]">{contact.title}</p>}
            {(contact.email || contact.phone) && (
              <p className="mt-1 space-x-2 text-xs text-[var(--muted-2)]">
                {contact.email && <span>{contact.email}</span>}
                {contact.phone && <span>{contact.phone}</span>}
              </p>
            )}
            {contact.linkedinUrl && (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-[var(--muted)] transition-colors hover:text-white"
              >
                LinkedIn ↗
              </a>
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

      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-[var(--muted)]">Find the owner</p>
        {tavilyConfigured ? (
          <form action={findOwnerViaSearchAction}>
            <input type="hidden" name="companyId" value={companyId} />
            <button type="submit" className="btn-primary w-full text-xs">
              Search BBB + LinkedIn for the owner
            </button>
          </form>
        ) : (
          <p className="text-xs text-[var(--muted-2)]">
            Set TAVILY_API_KEY for a free, automatic BBB/LinkedIn owner search
            (also runs during lead discovery — see .env.example).
          </p>
        )}
        {apolloConfigured && (
          <form action={findOwnerViaApolloAction}>
            <input type="hidden" name="companyId" value={companyId} />
            <button
              type="submit"
              disabled={!hasWebsite}
              className="btn-ghost w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
              title={hasWebsite ? undefined : "Add a website first — this matches by company domain."}
            >
              Look up via Apollo instead (paid)
            </button>
          </form>
        )}
        <p className="pt-1 text-xs text-[var(--muted-2)]">Or check by hand:</p>
        <a
          href={bbbSearchUrl(companyName, companyCity, companyState)}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-[var(--muted)] transition-colors hover:text-white"
        >
          Search BBB for this business ↗
        </a>
        <a
          href={linkedinSearchUrl(companyName)}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-[var(--muted)] transition-colors hover:text-white"
        >
          Search LinkedIn for this business ↗
        </a>
      </div>

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
