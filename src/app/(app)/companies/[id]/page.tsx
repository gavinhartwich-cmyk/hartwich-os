import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data/companies";
import { listContactsForCompany } from "@/lib/data/contacts";
import { listActivitiesForCompany } from "@/lib/data/activities";
import { findRecentOutreachForContacts } from "@/lib/data/email-drafts";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import FormField from "@/components/form-field";
import StatusBadge from "@/components/status-badge";
import PageHeader from "@/components/page-header";
import Link from "next/link";
import ContactsPanel from "./contacts-panel";
import ActivityPanel from "./activity-panel";
import OutreachPanel from "./outreach-panel";
import { createDealAction, updateCompanyAction } from "./actions";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [company, contacts, activities, currentUser] = await Promise.all([
    getCompanyById(id),
    listContactsForCompany(id),
    listActivitiesForCompany(id),
    getCurrentAppUser(),
  ]);
  if (!company) notFound();

  const recentOutreachByContact = await findRecentOutreachForContacts(contacts.map((c) => c.id));

  return (
    <div className="mx-auto max-w-3xl fade-in">
      <PageHeader
        title={company.name}
        back={{ href: "/companies", label: "Companies" }}
        action={<StatusBadge status={company.status} />}
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
        <ContactsPanel companyId={company.id} contacts={contacts} />
      </div>

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
