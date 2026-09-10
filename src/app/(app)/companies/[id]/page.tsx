import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data/companies";
import { listContactsForCompany } from "@/lib/data/contacts";
import { listActivitiesForCompany } from "@/lib/data/activities";
import { findRecentOutreachForContacts, listEmailHistoryForCompany } from "@/lib/data/email-drafts";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isApolloConfigured } from "@/lib/integrations/apollo";
import { isTavilyConfigured } from "@/lib/integrations/tavily";
import FormField from "@/components/form-field";
import StatusBadge from "@/components/status-badge";
import PageHeader from "@/components/page-header";
import Link from "next/link";
import ContactsPanel from "./contacts-panel";
import ActivityPanel from "./activity-panel";
import OutreachPanel from "./outreach-panel";
import EmailHistoryPanel from "./email-history-panel";
import DeleteCompanyButton from "./delete-company-button";
import { createDealAction, updateCompanyAction } from "./actions";

const OWNER_LOOKUP_MESSAGES: Record<string, { tone: "ok" | "muted"; text: string }> = {
  found: { tone: "ok", text: "Found the owner and added them as a contact." },
  already_have: { tone: "muted", text: "Found the owner, but they're already a contact here." },
  not_found: { tone: "muted", text: "Couldn't find an owner/decision-maker for this company." },
  no_website: {
    tone: "muted",
    text: "Apollo needs a website to match by domain — add one, or use the free search lookup instead.",
  },
  error: { tone: "muted", text: "Something went wrong looking up the owner." },
};

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ownerLookup?: string }>;
}) {
  const { id } = await params;
  const { ownerLookup } = await searchParams;
  const [company, contacts, activities, currentUser, emailHistory] = await Promise.all([
    getCompanyById(id),
    listContactsForCompany(id),
    listActivitiesForCompany(id),
    getCurrentAppUser(),
    listEmailHistoryForCompany(id),
  ]);
  if (!company) notFound();

  const ownerLookupMessage = ownerLookup ? OWNER_LOOKUP_MESSAGES[ownerLookup] : undefined;
  const recentOutreachByContact = await findRecentOutreachForContacts(contacts.map((c) => c.id));

  return (
    <div className="mx-auto max-w-3xl fade-in">
      <PageHeader
        title={company.name}
        back={{ href: "/companies", label: "Companies" }}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={company.status} />
            <DeleteCompanyButton companyId={company.id} companyName={company.name} />
          </div>
        }
      />

      <div className="grid gap-8 md:grid-cols-[1fr_260px]">
        <form action={updateCompanyAction} className="space-y-4">
          <input type="hidden" name="id" value={company.id} />
          <FormField label="Company name" name="name" required defaultValue={company.name} />
          <FormField label="Website" name="website" type="url" defaultValue={company.website} />
          <FormField label="Phone" name="phone" type="tel" defaultValue={company.phone} />
          <FormField label="Address" name="addressLine" defaultValue={company.addressLine} />
          <div className="grid grid-cols-3 gap-3">
            <FormField label="City" name="city" defaultValue={company.city} />
            <FormField label="State" name="state" defaultValue={company.state} />
            <FormField label="ZIP" name="postalCode" defaultValue={company.postalCode} />
          </div>
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-[var(--muted)]">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={company.notes ?? ""}
              className="input-field"
            />
          </div>
          <button type="submit" className="btn-primary">
            Save changes
          </button>
        </form>

        <aside>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Deals</h2>
            <form action={createDealAction}>
              <button type="submit" className="btn-ghost text-xs">
                + New deal
              </button>
              <input type="hidden" name="companyId" value={company.id} />
            </form>
          </div>

          <ul className="mt-3 space-y-2">
            {company.deals.length === 0 && (
              <li className="text-sm text-[var(--muted-2)]">No deals yet.</li>
            )}
            {company.deals.map((deal) => (
              <li key={deal.id} className="surface-card p-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span
                    className={
                      deal.stage.isWon
                        ? "font-medium text-emerald-400"
                        : deal.stage.isLost
                          ? "font-medium text-[var(--muted-2)]"
                          : "font-medium text-white/90"
                    }
                  >
                    {deal.stage.name}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted-2)]">
                  {deal.owner?.name ?? "Unassigned"} ·{" "}
                  {new Date(deal.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>

          <Link
            href="/board"
            className="mt-3 inline-block text-xs text-[var(--muted)] transition-colors hover:text-white"
          >
            View on board →
          </Link>
        </aside>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_260px]">
        <ActivityPanel companyId={company.id} activities={activities} contacts={contacts} />
        <ContactsPanel
          companyId={company.id}
          companyName={company.name}
          companyCity={company.city}
          companyState={company.state}
          hasWebsite={Boolean(company.website)}
          apolloConfigured={isApolloConfigured()}
          tavilyConfigured={isTavilyConfigured()}
          contacts={contacts}
          ownerLookupMessage={ownerLookupMessage}
        />
      </div>

      <EmailHistoryPanel history={emailHistory} />

      {currentUser && (
        <OutreachPanel
          companyId={company.id}
          currentUserId={currentUser.id}
          contacts={contacts}
          recentOutreachByContact={recentOutreachByContact}
          research={{
            googleRating: company.googleRating,
            googleReviewCount: company.googleReviewCount,
            isOwnerOperated: company.isOwnerOperated,
            qualificationReasoning: company.qualificationReasoning,
            websiteSummary: company.websiteSummary,
            servicesOffered: company.servicesOffered,
          }}
        />
      )}
    </div>
  );
}
