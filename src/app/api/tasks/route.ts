import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { createTask, listTasksInRange } from "@/lib/data/tasks";

const CreateTaskSchema = z.object({
  description: z.string().min(1),
  dueDate: z.string().datetime(),
  durationMinutes: z.number().int().positive().optional(),
  location: z.string().optional(),
  companyId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  syncToCalendar: z.boolean().optional(),
});

/** GET /api/tasks?from=ISO&to=ISO — tasks in range, for the calendar view. */
export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to query params are required (ISO dates)" },
      { status: 400 }
    );
  }

  const results = await listTasksInRange(new Date(from), new Date(to));
  return NextResponse.json({ tasks: results });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = CreateTaskSchema.parse(body);

    const task = await createTask({
      description: input.description,
      dueDate: new Date(input.dueDate),
      durationMinutes: input.durationMinutes,
      location: input.location,
      companyId: input.companyId,
      dealId: input.dealId,
      assignedTo: user.id,
      syncToCalendar: input.syncToCalendar,
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Error creating task:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create task", details: String(error) },
      { status: 500 }
    );
  }
}
