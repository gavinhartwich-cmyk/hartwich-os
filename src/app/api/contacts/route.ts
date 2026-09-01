import { NextResponse } from "next/server";
import { db } from "@/db";

export async function GET() {
  try {
    const contactsList = await db.query.contacts.findMany({
      with: {
        company: {
          columns: { id: true, name: true },
        },
      },
      limit: 100,
    });

    return NextResponse.json(contactsList);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
