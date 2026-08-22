import "server-only";
import { z } from "zod";
import { groq } from "./groq";
import { db } from "@/db";
import { aiRuns } from "@/db/schema";

/**
 * AI email drafting using Groq
 * Takes company data + user's instruction → generates email subject + body
 */

const EmailDraftSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body text (professional, 2-3 paragraphs)"),
});

type EmailDraft = z.infer<typeof EmailDraftSchema>;

export async function draftOutreachEmail({
  companyName,
  contactName,
  instruction,
  yourName,
  yourCompany,
}: {
  companyName: string;
  contactName?: string;
  instruction: string;
  yourName: string;
  yourCompany: string;
}): Promise<EmailDraft & { aiRunId: string }> {
  const prompt = `You are an expert sales email writer for HVAC businesses.

Draft a professional, personalized cold outreach email based on:
- Target company: ${companyName}
- Contact name: ${contactName || "Hiring Manager"}
- Your name: ${yourName}
- Your company: ${yourCompany}
- What you want to say: ${instruction}

Write a concise, personalized email that:
1. Opens with a specific, relevant observation about their business
2. Explains your value prop in 1-2 sentences
3. Ends with a clear, low-friction call-to-action

Keep it professional but conversational. Aim for 3-4 paragraphs, ~150-200 words.`;

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
        subject: "Follow-up: HVAC Services for " + companyName,
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
