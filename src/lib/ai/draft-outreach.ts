import "server-only";
import { z } from "zod";
import { groq } from "./groq";
import { db } from "@/db";
import { aiRuns } from "@/db/schema";

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
 */

const EmailDraftSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body text (professional, 2-3 paragraphs)"),
});

type EmailDraft = z.infer<typeof EmailDraftSchema>;

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

  const prompt = `You are an expert sales email writer for Hartwich Labs, which helps HVAC businesses fix their online reputation and win more reviews.

Target company: ${company.name}${company.website ? ` (${company.website})` : ""}
Contact: ${contact?.name || "Hiring Manager"}${contact?.title ? `, ${contact.title}` : ""}
Your name: ${yourName}
Your company: ${yourCompany}

What we know about this business from research:
${researchContext}
${angle ? `\nSpecific angle to emphasize: ${angle}` : ""}

Draft a concise, personalized cold outreach email that:
1. Opens with a specific, genuine observation drawn from the research above (not a generic compliment) — reference something real about their reviews, size, services, or website if it's there.
2. Connects that observation to a concrete way Hartwich Labs' review-management service could help them specifically.
3. Ends with a clear, low-friction call-to-action (e.g. a quick call).

Keep it professional but conversational. Aim for 3-4 paragraphs, ~150-200 words. Do not invent facts that aren't in the research above — if research is thin, keep the email more general rather than making things up.`;

  const startTime = Date.now();
  const aiRunId = crypto.randomUUID();

  try {
    const response = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from Groq");
    }

    // Try to parse structured output; if not, extract subject/body from text
    let draft: EmailDraft;
    try {
      // If the model returned JSON-like structure, parse it
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        draft = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: treat first line as subject, rest as body
        const lines = content.trim().split("\n");
        draft = {
          subject: lines[0] || "Follow-up: HVAC Services",
          body: lines.slice(1).join("\n").trim(),
        };
      }
    } catch {
      draft = {
        subject: "Follow-up: HVAC Services for " + company.name,
        body: content,
      };
    }

    // Log the AI run
    const tokensUsed = response.usage?.total_tokens || 0;
    const costEstimate = (tokensUsed / 1000000) * 0.27; // Groq pricing per million tokens

    await db.insert(aiRuns).values({
      id: aiRunId,
      targetType: "outreach_draft",
      model: "mixtral-8x7b-32768",
      prompt: prompt.substring(0, 500), // Store first 500 chars for audit
      tokensUsed,
      costEstimateUsd: costEstimate.toString(),
      result: { draft },
      status: "succeeded",
    });

    return {
      ...draft,
      aiRunId,
    };
  } catch (error) {
    // Log failed run
    await db.insert(aiRuns).values({
      id: aiRunId,
      targetType: "outreach_draft",
      model: "mixtral-8x7b-32768",
      prompt: prompt.substring(0, 500),
      status: "failed",
      result: { error: String(error) },
    });

    throw error;
  }
}
