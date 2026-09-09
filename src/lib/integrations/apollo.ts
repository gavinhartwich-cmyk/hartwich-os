import "server-only";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// Titles/seniorities that plausibly mean "the person who owns or runs this
// small business" — the ICP here is HVAC-style owner-operated shops, not
// enterprises with a formal C-suite, so the list leans toward small-business
// language ("Owner", "Managing Partner") over corporate titles.
const OWNER_TITLES = [
  "Owner",
  "Co-Owner",
  "President",
  "CEO",
  "Founder",
  "Co-Founder",
  "General Manager",
  "Managing Partner",
  "Principal",
];
const OWNER_SENIORITIES = ["owner", "founder", "c_suite"];

// Apollo returns this literal placeholder instead of a real address when an
// email exists but hasn't been unlocked by this call (see
// support.apollo.io — "Use the Apollo API"). Never surface it as a contact
// email.
const UNLOCKED_EMAIL_PLACEHOLDER = "email_not_unlocked@domain.com";

export type ApolloOwnerContact = {
  name: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
};

export function isApolloConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.APOLLO_API_KEY!,
  };
}

/**
 * Finds the likely owner/decision-maker of a company by domain, using
 * Apollo's contact database (which is largely LinkedIn-sourced — this is
 * the practical, ToS-compliant stand-in for "look them up on LinkedIn": a
 * direct scrape of LinkedIn itself isn't something a server can do
 * reliably or legitimately).
 *
 * Two calls, by Apollo's own design (docs.apollo.io/reference/people-api-search):
 * `mixed_people/api_search` finds candidates at the domain filtered to
 * owner-shaped titles, but deliberately obfuscates the last name and omits
 * email/LinkedIn in search results — `people/match` on the top candidate's
 * id is what actually spends a credit and reveals the full record. That
 * credit cost (Apollo has no free tier, unlike Groq elsewhere in this app)
 * is why this is a manual, per-company lookup (the "Find owner" button on
 * the company page) rather than something wired into bulk lead discovery,
 * which would spend credits on every company found whether the user is
 * pursuing it or not.
 *
 * Returns null if Apollo isn't configured, no candidate is found, or
 * either call fails — callers treat "no owner found" as a normal,
 * unsurprising outcome, not an error.
 */
export async function findOwnerContact(domain: string): Promise<ApolloOwnerContact | null> {
  if (!isApolloConfigured()) return null;

  let candidateId: string | null = null;
  try {
    const searchRes = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        q_organization_domains_list: [domain],
        person_titles: OWNER_TITLES,
        person_seniorities: OWNER_SENIORITIES,
        per_page: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as { people?: Array<{ id: string }> };
    candidateId = searchData.people?.[0]?.id ?? null;
  } catch {
    return null;
  }
  if (!candidateId) return null;

  try {
    const matchRes = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: headers(),
      // reveal_personal_emails stays false — a work/business email is enough
      // for outreach, and unlocking personal emails costs extra credits for
      // data this app doesn't need.
      body: JSON.stringify({ id: candidateId, reveal_personal_emails: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!matchRes.ok) return null;

    const matchData = (await matchRes.json()) as {
      person?: {
        first_name?: string | null;
        last_name?: string | null;
        title?: string | null;
        email?: string | null;
        linkedin_url?: string | null;
      };
    };

    const person = matchData.person;
    const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
    if (!name) return null;

    const email = person?.email && person.email !== UNLOCKED_EMAIL_PLACEHOLDER ? person.email : null;

    return {
      name,
      title: person?.title || null,
      email,
      linkedinUrl: person?.linkedin_url || null,
    };
  } catch {
    return null;
  }
}
