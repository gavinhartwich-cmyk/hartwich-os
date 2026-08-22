import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmailViaGmail } from "@/lib/integrations/gmail";
import { db } from "@/db";
import { activities, messages, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

const SendEmailSchema = z.object({
  contactId: z.string().uuid("Invalid contact ID"),
  subject: z.string().min(1, "Subject required"),
  body: z.string().min(1, "Body required"),
  aiRunId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, subject, body: bodyText, aiRunId } = SendEmailSchema.parse(body);

    // Fetch contact and company details
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, contactId),
      with: {
        company: true,
      },
    });

    if (!contact || !contact.email) {
      return NextResponse.json(
        { error: "Contact not found or has no email" },
        { status: 404 }
      );
    }

    // Send via Gmail
    const messageId = await sendEmailViaGmail({
      to: contact.email,
      subject,
      body: bodyText,
    });

    // Create activity record
    const activityRecord = await db
      .insert(activities)
      .values({
        companyId: contact.companyId,
        contactId,
        type: "email",
        direction: "outbound",
        bodyText,
        aiGenerated: !!aiRunId,
        createdBy: null,
      })
      .returning();

    // Create message record
    await db.insert(messages).values({
      activityId: activityRecord[0].id,
      provider: "gmail",
      providerMessageId: messageId,
      status: "sent",
      toAddress: contact.email,
      fromAddress: process.env.GMAIL_FROM_ADDRESS || "noreply@hartwich.ai",
      subject,
      body: bodyText,
      generatedByAi: !!aiRunId,
      aiPromptVersion: aiRunId || undefined,
    });

    return NextResponse.json({
      success: true,
      messageId,
      activityId: activityRecord[0].id,
      message: `Email sent to ${contact.email}`,
    });
  } catch (error) {
    console.error("Error sending email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send email", details: String(error) },
      { status: 500 }
    );
  }
}
