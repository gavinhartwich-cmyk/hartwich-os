import "server-only";
import { asc, desc, eq, ilike, ne, and, or, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, deals, pipelineStages, contacts } from "@/db/schema";
import type { CompanyEnrichment } from "@/lib/ai/enrich-company";

export type CompanyInput = {
  name: string;
  website?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
};

export async function listCompanies(search?: string) {
  if (search && search.trim()) {
    return db
      .select()
      .from(companies)
      .where(
        and(
          ilike(companies.name, `%${search.trim()}%`),
          ne(companies.status, "disqualified")
        )
      )
      .orderBy(desc(companies.createdAt));
  }
  return db
    .select()
    .from(companies)
    .where(ne(companies.status, "disqualified"))
    .orderBy(desc(companies.createdAt));
}

export async function getCompanyById(id: string) {
  return db.query.companies.findFirst({
    where: (company, { eq }) => eq(company.id, id),
    with: {
      deals: {
        with: { stage: true, owner: true },
        orderBy: (deal, { desc }) => desc(deal.createdAt),
      },
    },
  });
}

/**
 * Creates a company and its first deal together, atomically. Manual
 * entry (this MVP's only intake path until Phase 2's AI mining lands)
 * always means "I want to work this lead now," so we skip the
 * needs_review gate that AI-sourced leads get and drop it straight into
 * the earliest pipeline stage.
 */
export async function createCompanyWithInitialDeal(
  input: CompanyInput,
  currentUserId: string
) {
  return db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        name: input.name,
        website: input.website || null,
        phone: input.phone || null,
        addressLine: input.addressLine || null,
        city: input.city || null,
        state: input.state || null,
        postalCode: input.postalCode || null,
        notes: input.notes || null,
        source: "manual",
        status: "qualified",
        createdBy: currentUserId,
      })
      .returning();

    const [firstStage] = await tx
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.position))
      .limit(1);

    if (!firstStage) {
      throw new Error(
        "No pipeline stages exist yet — run `npm run db:seed` before adding companies."
      );
    }

    const [deal] = await tx
      .insert(deals)
      .values({
        companyId: company.id,
        stageId: firstStage.id,
        ownerUserId: currentUserId,
      })
      .returning();

    return { company, deal };
  });
}

export async function updateCompany(id: string, input: Partial<CompanyInput>) {
  const [company] = await db
    .update(companies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  return company;
}

/**
 * Permanently deletes a company and everything under it — contacts, deals,
 * activities, email_drafts, and tasks all cascade via their FK
 * (onDelete: "cascade" on companyId, see schema.ts); any booking that
 * pointed at this company has its companyId set null instead of being
 * deleted (onDelete: "set null") so the booking record itself survives.
 * Irreversible — the company detail page gates this behind a confirmation
 * before ever calling it.
 */
export async function deleteCompany(id: string) {
  await db.delete(companies).where(eq(companies.id, id));
}

// ---------------------------------------------------------------------------
// Lead mining (Phase 2, architecture doc §5) — dedup, discovery persistence,
// and the review-queue actions.
// ---------------------------------------------------------------------------

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(llc|inc|incorporated|co|corp|corporation|company|ltd)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function websiteDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Dedup check for lead discovery ("Deduplicate" step, §5) — matches a
 * newly-found place against existing companies by normalized name or
 * website domain, so re-running a search doesn't create duplicate leads.
 * A full-table scan is fine at this app's scale (two users, hundreds of
 * companies); revisit with an indexed/normalized column if that changes.
 */
export async function findDuplicateCompany(input: { name: string; website: string | null }) {
  const normalizedTarget = normalizeCompanyName(input.name);
  const targetDomain = websiteDomain(input.website);

  const candidates = await db
    .select({ id: companies.id, name: companies.name, website: companies.website })
    .from(companies);

  return (
    candidates.find((c) => {
      if (targetDomain && websiteDomain(c.website) === targetDomain) return true;
      return normalizeCompanyName(c.name) === normalizedTarget;
    }) ?? null
  );
}

export type DuplicateCompanyGroup = {
  /** The company to keep — most deal/contact/activity history, then oldest. */
  survivorId: string;
  /** Everything else in the group, to be merged into survivorId and removed. */
  duplicateIds: string[];
};

/**
 * Finds every existing duplicate cluster in the companies table, using the
 * exact same match rule findDuplicateCompany (above) applies one-at-a-time
 * during lead discovery — normalized name, or website domain, matches. That
 * check only runs for a *newly discovered* place, and manual entry
 * (createCompanyWithInitialDeal) never runs it at all, so duplicates from
 * before the check existed, or from manual entry, can still be sitting in
 * the table. This is the batch version, for a one-time cleanup pass
 * (see scripts/fix-old-leads.ts, which currently inlines its own copy of
 * this same union-find rather than importing this — worth consolidating
 * later) — clusters transitively (union-find) since that's the natural
 * extension of a pairwise rule to grouping the whole table: if A matches B
 * and B matches C, all three are one group even if A and C don't directly
 * match.
 */
export async function findDuplicateCompanyGroups(): Promise<DuplicateCompanyGroup[]> {
  const all = await db.query.companies.findMany({
    with: { contacts: true, deals: true, activities: true },
    orderBy: (c, { asc }) => asc(c.createdAt),
  });

  const parent = all.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) i = parent[i];
    return i;
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  const normalized = all.map((c) => normalizeCompanyName(c.name));
  const domains = all.map((c) => websiteDomain(c.website));

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const sameDomain = domains[i] && domains[j] && domains[i] === domains[j];
      const sameName = normalized[i] === normalized[j];
      if (sameDomain || sameName) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < all.length; i++) {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  }

  const result: DuplicateCompanyGroup[] = [];
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;

    // Survivor: most deals/contacts/activities (i.e. most worked), then
    // oldest record (all is already sorted oldest-first, so the first
    // index encountered per tier wins that tie).
    let survivor = indices[0];
    let bestScore = -1;
    for (const i of indices) {
      const c = all[i];
      const score = (c.deals.length > 0 ? 1000 : 0) + c.contacts.length * 10 + c.activities.length;
      if (score > bestScore) {
        bestScore = score;
        survivor = i;
      }
    }

    result.push({
      survivorId: all[survivor].id,
      duplicateIds: indices.filter((i) => i !== survivor).map((i) => all[i].id),
    });
  }

  return result;
}

export type DiscoveredCompanyInput = {
  place: {
    name: string;
    address: string | null;
    phone: string | null;
    website: string | null;
    rating: number | null;
    userRatingCount: number | null;
  };
  placeId: string;
  qualification: {
    autoFile: boolean;
    score: number;
    reasoning: string;
    contactTier: "A" | "B" | "C" | null;
    isOwnerOperated: boolean | null;
    isFranchise: boolean;
    disqualifyReason: string | null;
  };
  enrichment?: CompanyEnrichment | null;
};

/**
 * Persists one discovered lead ("Persist" step, §5). Always writes the
 * company row — even disqualified ones — so a future re-run's dedup check
 * skips it instead of re-spending API/AI calls. Only qualified leads (score
 * cleared the auto-file threshold) get a deal, which is what puts them on
 * the board; needs_review ones wait in the review queue instead (no deal,
 * so they don't show up there).
 */
export async function createDiscoveredCompany(input: DiscoveredCompanyInput) {
  return db.transaction(async (tx) => {
    const status = input.qualification.disqualifyReason
      ? "disqualified"
      : input.qualification.autoFile
        ? "qualified"
        : "needs_review";

    const [company] = await tx
      .insert(companies)
      .values({
        name: input.place.name,
        website: input.place.website,
        phone: input.place.phone,
        addressLine: input.place.address,
        source: "google_places",
        sourceRefId: input.placeId,
        googleReviewCount: input.place.userRatingCount,
        googleRating: input.place.rating != null ? input.place.rating.toFixed(2) : null,
        isOwnerOperated: input.qualification.isOwnerOperated,
        isFranchise: input.qualification.isFranchise,
        contactTier: input.qualification.contactTier,
        qualificationScore: input.qualification.score,
        qualificationReasoning: input.qualification.reasoning,
        disqualifyReason: input.qualification.disqualifyReason,
        websiteSummary: input.enrichment?.summary || null,
        servicesOffered: input.enrichment?.servicesOffered || null,
        apparentSize: input.enrichment?.apparentSize || null,
        status,
      })
      .returning();

    // Create a contact from whatever enrichment found. Prefer the named
    // decision-maker's own email; when the LLM found a person but no email
    // for them (common — most small-business sites don't put an owner's
    // email next to their name) or found no named contact at all, fall back
    // to the mailbox scraped straight off the page (see extractFallbackEmail
    // in enrich-company.ts) so there's still something to send outreach to
    // instead of leaving the user to go find an email by hand.
    const en = input.enrichment;
    const email = en?.contactEmail || en?.fallbackEmail || null;
    if (en?.contactName || email || en?.contactPhone || en?.contactLinkedinUrl) {
      await tx.insert(contacts).values({
        companyId: company.id,
        name: en?.contactName || null,
        title: en?.contactTitle || (!en?.contactName && email ? "General inquiries" : null),
        email,
        phone: en?.contactPhone || null,
        linkedinUrl: en?.contactLinkedinUrl || null,
        isPrimary: true,
        source: "google_places",
      });
    }

    if (status === "qualified") {
      const [firstStage] = await tx
        .select()
        .from(pipelineStages)
        .orderBy(asc(pipelineStages.position))
        .limit(1);

      if (firstStage) {
        await tx.insert(deals).values({ companyId: company.id, stageId: firstStage.id });
      }
    }

    return company;
  });
}

export async function listCompaniesByStatus(status: "needs_review" | "qualified" | "disqualified") {
  return db.query.companies.findMany({
    where: (c, { eq }) => eq(c.status, status),
    orderBy: (c, { desc }) => desc(c.createdAt),
  });
}

/**
 * Review-queue "Move to board" action — qualifies the lead and creates its
 * first deal, or returns the one it already has.
 *
 * The guard is the point. This said "creates its first deal" but inserted
 * unconditionally, and until 2026-09-11 the review queue kept listing
 * already-promoted companies with a live "Move to board" button — so
 * pressing it twice produced a second card for the same company. Five
 * companies ended up with two or three deals each, and the extras looked
 * un-actioned in New Lead while the company's one real outreach sat against
 * a sibling deal in Contacted.
 *
 * Won and lost deals don't count as open: a company that was closed out and
 * is genuinely being worked again should get a fresh card.
 */
export async function promoteCompanyToBoard(companyId: string, ownerUserId: string) {
  return db.transaction(async (tx) => {
    const closedStageIds = (
      await tx
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(or(eq(pipelineStages.isWon, true), eq(pipelineStages.isLost, true)))
    ).map((s) => s.id);

    const [existing] = await tx
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.companyId, companyId),
          ...(closedStageIds.length > 0 ? [notInArray(deals.stageId, closedStageIds)] : [])
        )
      )
      .limit(1);

    await tx
      .update(companies)
      .set({ status: "qualified", updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    if (existing) return existing;

    const [firstStage] = await tx
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.position))
      .limit(1);
    if (!firstStage) {
      throw new Error("No pipeline stages exist yet — run `npm run db:seed`.");
    }

    const [deal] = await tx
      .insert(deals)
      .values({ companyId, stageId: firstStage.id, ownerUserId })
      .returning();
    return deal;
  });
}

/**
 * Review-queue "Disqualify" action — also closes any deal the company still
 * has open.
 *
 * This used to only flip the company's status, leaving the deal in whatever
 * active column it was in, so the board kept showing cards for leads that
 * had already been rejected (4 of them on 2026-09-10 — two in "New Lead",
 * two in "Contacted"). Rejecting a lead in one place and still being asked
 * to look at it in another is the bug.
 *
 * Deals move to the Lost stage rather than being deleted: for anything
 * already contacted, that outreach history is the reason we don't email them
 * again, and Lost is the column that exists for this. A deal already in a
 * won stage is left alone — that combination means someone made a mistake,
 * and silently closing a won deal is the more damaging guess.
 */
export async function disqualifyCompany(companyId: string, reason?: string) {
  return db.transaction(async (tx) => {
    const [company] = await tx
      .update(companies)
      .set({
        status: "disqualified",
        disqualifyReason: reason || "Manually disqualified from review queue.",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning();

    const [lostStage] = await tx.select().from(pipelineStages).where(eq(pipelineStages.isLost, true)).limit(1);
    if (lostStage) {
      const wonStageIds = (
        await tx.select({ id: pipelineStages.id }).from(pipelineStages).where(eq(pipelineStages.isWon, true))
      ).map((s) => s.id);

      await tx
        .update(deals)
        .set({ stageId: lostStage.id, stageEnteredAt: new Date() })
        .where(
          and(
            eq(deals.companyId, companyId),
            ne(deals.stageId, lostStage.id),
            ...(wonStageIds.length > 0 ? [notInArray(deals.stageId, wonStageIds)] : [])
          )
        );
    }

    return company;
  });
}
