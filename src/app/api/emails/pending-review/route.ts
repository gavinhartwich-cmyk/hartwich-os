import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const drafts = await db.query.emailDrafts.findMany({
      where: (ed, { eq }) => eq(ed.status, "pending_review"),
      with: {
        contact: true,
        company: true,
        deal: {
          with: {
            stage: true,
          },
        },
      },
      orderBy: (ed, { desc }) => desc(ed.createdAt),
    });

    return NextResponse.json({
      success: true,
      count: drafts.length,
      drafts: drafts.map((d) => ({
        id: d.id,
        contactName: d.contact.name,
        contactEmail: d.contact.email,
        companyName: d.company.name,
        subject: d.subject,
        bodyPreview: d.body.substring(0, 200) + (d.body.length > 200 ? "..." : ""),
        dealStage: d.deal?.stage.name,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching pending reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending reviews", details: String(error) },
      { status: 500 }
    );
  }
}
