import { structuredCompletion, GROQ_STRUCTURED_MODEL } from "@/lib/ai/groq-structured";
import { logAiRun } from "@/lib/data/ai-runs";
import { z } from "zod";

const SuggestionsSchema = z.object({
  email: z.string(),
  linkedin: z.string(),
  phone: z.string(),
  instagram: z.string(),
});

const SUGGESTIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    email: { type: "string", description: "Personalized email subject and body" },
    linkedin: { type: "string", description: "LinkedIn connection request message" },
    phone: { type: "string", description: "Phone call script (opening statement)" },
    instagram: { type: "string", description: "Instagram DM message" },
  },
  required: ["email", "linkedin", "phone", "instagram"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  try {
    const { companyName, contactName, contactTitle, painPoints } = await request.json();

    const prompt = `Generate personalized outreach messages for ${contactName} (${contactTitle}) at ${companyName}.

Context: ${painPoints}

Create FOUR short, specific messages:
1. EMAIL: A personalized email (subject line + body, 3-4 sentences)
2. LINKEDIN: A connection request message that references their business
3. PHONE: A 2-3 sentence opening for a cold call
4. INSTAGRAM: A casual DM if they're an owner/decision maker

Make each message genuine, specific to HVAC industry, and show you've done research.
Keep messages concise and action-oriented.`;

    const result = await structuredCompletion({
      schemaName: "outreach_suggestions",
      jsonSchema: SUGGESTIONS_JSON_SCHEMA,
      zodSchema: SuggestionsSchema,
      system:
        "You are an expert B2B sales copywriter specializing in HVAC business outreach. " +
        "Create personalized, high-converting outreach messages that feel genuine and specific. " +
        "Each message should acknowledge the business and its potential challenges.",
      user: prompt,
    });

    await logAiRun({
      targetType: "outreach_draft",
      model: GROQ_STRUCTURED_MODEL,
      tokensUsed: result ? result.usage.inputTokens + result.usage.outputTokens : null,
      result: result?.parsed ?? null,
      status: result ? "succeeded" : "failed",
    });

    return Response.json({
      success: true,
      suggestions: result?.parsed || null,
    });
  } catch (error) {
    console.error("Error generating suggestions:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
