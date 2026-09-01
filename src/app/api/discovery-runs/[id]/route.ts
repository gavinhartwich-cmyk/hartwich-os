import { NextRequest, NextResponse } from "next/server";
import { getDiscoveryRun } from "@/lib/data/discovery-runs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getDiscoveryRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({ run });
}
