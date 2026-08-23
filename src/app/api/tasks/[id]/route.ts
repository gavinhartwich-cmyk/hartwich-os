import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { completeTask, deleteTask, rescheduleTask } from "@/lib/data/tasks";

const PatchTaskSchema = z.object({
  action: z.enum(["complete", "reschedule"]),
  dueDate: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const input = PatchTaskSchema.parse(body);

    if (input.action === "complete") {
      const task = await completeTask(id);
      return NextResponse.json({ success: true, task });
    }

    if (!input.dueDate) {
      return NextResponse.json(
        { error: "dueDate is required to reschedule" },
        { status: 400 }
      );
    }

    const task = await rescheduleTask(
      id,
      new Date(input.dueDate),
      input.durationMinutes
    );
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Error updating task:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update task", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const task = await deleteTask(id);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
