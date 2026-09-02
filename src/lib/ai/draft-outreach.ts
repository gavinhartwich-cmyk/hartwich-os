import "server-only";
import { z } from "zod";
import { structuredCompletion, GROQ_STRUCTURED_MODEL } from "./groq-structured";
import { logAiRun } from "@/lib/data/ai-runs";

/**
 * AI email drafting using Groq.
 *
 * Builds the prompt from the company's own record — Google review
 * signals, qualification reasoning, and (when available) website
 * enrichment — instead of requiring the caller to hand-type a
 * description of the business every time. This is the data the
 * discovery pipeline already gathered in the "Enrich"/"Qualify" steps
 * (architecture doc §5); a personalized email should read like it, not
 * like a generic template.
 *
 * Goes through structuredCompletion() (see groq-structured.ts) rather than
 * a raw chat completion — this call used to hand-roll its own JSON-regex
 * parsing with no retry, which meant a transient Groq 429 or the model's
 * hidden reasoning tokens (GROQ_STRUCTURED_MODEL is a reasoning model)
 * bleeding into `content` could produce a garbled draft or a hard failure.
 * structuredCompletion's strict json_schema mode keeps `content` to just
 * the schema, and its 429 retry-with-backoff is the same protection
 * enrichCompanyFromWebsite/qualifyLead already get.
 */

const EmailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

type EmailDraft = z.infer<typeof EmailDraftSchema>;

// Hand-written to Groq's strict structured-output dialect (see
// groq-structured.ts) — keep in sync with EmailDraftSchema above.
const EMAIL_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

export type OutreachCompanyContext = {
  name: string;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  googleReviewCount?: number | null;
  googleRating?: string | null;
  isOwnerOperated?: boolean | null;
  qualificationReasoning?: string | null;
  websiteSummary?: string | null;
  servicesOffered?: string[] | null;
  apparentSize?: string | null;
  notes?: string | null;
};

export type OutreachContactContext = {
  name?: string | null;
  title?: string | null;
};

/**
 * Renders whatever research signals exist on the company into a bulleted
 * "what we know" block. Every field is optional — leads discovered before
 * a signal existed, or with no website to read, still get a draft, just
 * with fewer specifics to work from.
 */
function buildResearchContext(company: OutreachCompanyContext): string {
  const lines: string[] = [];

  const location = [company.city, company.state].filter(Boolean).join(", ");
  if (location) lines.push(`- Located in ${location}`);

  if (company.googleRating || company.googleReviewCount) {
    const rating = company.googleRating ? `${company.googleRating}★` : "unrated";
    const count =
      company.googleReviewCount != null ? `${company.googleReviewCount} Google reviews` : "review count unknown";
    lines.push(`- ${rating} on Google, ${count}`);
  }

  if (company.isOwnerOperated) lines.push(`- Owner-operated business`);

  if (company.apparentSize && company.apparentSize !== "unknown") {
    lines.push(`- Appears to be a ${company.apparentSize}-sized operation`);
  }

  if (company.servicesOffered && company.servicesOffered.length > 0) {
    lines.push(`- Services offered: ${company.servicesOffered.join(", ")}`);
  }

  if (company.websiteSummary) {
    lines.push(`- Website summary: ${company.websiteSummary}`);
  }

  if (company.qualificationReasoning) {
    lines.push(`- Lead research notes: ${company.qualificationReasoning}`);
  }

  if (company.notes) {
    lines.push(`- Gavin's own notes on this lead: ${company.notes}`);
  }

  return lines.length > 0 ? lines.join("\n") : "- No additional research on file yet.";
}

// Rewritten after a real-world quality review of the first 3 emails this
// sent — see chat history around 2026-09-02. Two concrete defects drove
// this: (1) the model fabricated a Hartwich Labs "track record" stat that
// doesn't exist (the company had sent 3 emails total at the time), despite
// the old prompt already saying not to invent facts — the ban needed to be
// specific, not general. (2) subject lines and phrasing were templated
// enough to repeat near-verbatim across different companies (2-4 word
// subjects out-open 10-word ones per 2026 B2B cold-email data, and
// templated-feeling copy is what actually gets AI email flagged as spam —
// filters punish the pattern, not the fact that AI wrote it).
const SYSTEM_PROMPT = `You are Gavin, writing a real, one-off cold email for Hartwich Labs, which helps HVAC businesses fix their online reputation and win more reviews. It should read like a specific person looked at this one business and decided to email them — not like a template with the company name swapped in.

Draft a personalized cold outreach email that:
1. Opens with a specific, genuine observation drawn from the research provided (not a generic compliment) — reference something real about their reviews, size, services, or website if it's there. If no contact name is known, greet generically ("Hi there," or similar) — never invent a name, and never address them by a job title as if it were their name.
2. Connects that observation to a concrete way Hartwich Labs' review-management service could help them specifically.
3. Ends with ONE clear, low-friction call-to-action (e.g. a quick call) — never more than one ask.

Hard rules:
- Do not invent facts, numbers, or claims that aren't in the research provided — this includes results or stats about Hartwich Labs' own track record (e.g. never write something like "clients typically double their reviews in 90 days"). Hartwich Labs is a brand-new company with no such history to cite yet. If the research is thin, keep the email more general instead of making something up.
- Subject line: 3-6 words, under 50 characters. A short, specific hook beats a complete-sentence summary of the pitch.
- Avoid stock sales phrasing and reused formulas — no "solid foundation, yet...", no "steady flow of fresh reviews", no "amplify your online reputation". Write this one in your own words, as if it's the only cold email you're sending today.
- Keep punctuation plain and varied — don't lean on em dashes as a crutch; ordinary sentences and commas read less like AI-generated text.

Keep it professional but conversational, 120-160 words.`;

export async function draftOutreachEmail({
  company,
  contact,
  angle,
  yourName,
  yourCompany,
}: {
  company: OutreachCompanyContext;
  contact?: OutreachContactContext | null;
  /** Optional extra direction from Gavin — a specific angle to emphasize, not required. */
  angle?: string | null;
  yourName: string;
  yourCompany: string;
}): Promise<EmailDraft & { aiRunId: string }> {
  const researchContext = buildResearchContext(company);

  // "Hiring Manager" used to be the fallback here when no named contact was
  // known — wrong register entirely (that's recruiting boilerplate, not
  // sales), and the model dutifully greeted a prospect with "Hi Hiring
  // Manager," in a real sent email. Telling it plainly that no name is
  // known lets the system prompt's own greeting rule (generic "Hi there,")
  // take over instead.
  const contactLine = contact?.name
    ? `Contact: ${contact.name}${contact.title ? `, ${contact.title}` : ""}`
    : "Contact: no named contact known — greet generically, do not invent a name.";

  const userPrompt = `Target company: ${company.name}${company.website ? ` (${company.website})` : ""}
${contactLine}
Your name: ${yourName}
Your company: ${yourCompany}

What we know about this business from research:
${researchContext}
${angle ? `\nSpecific angle to emphasize: ${angle}` : ""}`;

  try {
    const result = await structuredCompletion({
      schemaName: "email_draft",
      jsonSchema: EMAIL_DRAFT_JSON_SCHEMA,
      zodSchema: EmailDraftSchema,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      // A full email body runs longer than the compact JSON structuredCompletion's
      // other call sites produce — the default 1024 budget leaves too little
      // headroom once this reasoning model's hidden reasoning tokens are accounted for.
      maxCompletionTokens: 1500,
    });

    if (!result) {
      throw new Error("No structured response from Groq");
    }

    const run = await logAiRun({
      targetType: "outreach_draft",
      model: GROQ_STRUCTURED_MODEL,
      prompt: userPrompt.substring(0, 500), // Store first 500 chars for audit
      tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
      // No verified per-token Groq pricing for this model on hand (see
      // enrichCompanyFromWebsite/qualifyLead, which log the same way) —
      // leaving cost unestimated beats silently logging a wrong number.
      result: { draft: result.parsed },
      status: "succeeded",
    });

    return {
      ...result.parsed,
      aiRunId: run.id,
    };
  } catch (error) {
    await logAiRun({
      targetType: "outreach_draft",
      model: GROQ_STRUCTURED_MODEL,
      prompt: userPrompt.substring(0, 500),
      status: "failed",
      result: { error: error instanceof Error ? error.message : String(error) },
    });

    throw error;
  }
}
