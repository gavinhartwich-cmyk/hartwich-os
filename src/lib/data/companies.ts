import "server-only";
import { asc, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { companies, deals, pipelineStages } from "@/db/schema";

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
      .where(ilike(companies.name, `%${search.trim()}%`))
      .orderBy(desc(companies.createdAt));
  }
  return db.select().from(companies).orderBy(desc(companies.createdAt));
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
