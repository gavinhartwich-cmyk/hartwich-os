import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/integrations/google-calendar";

export type TaskInput = {
  description: string;
  dueDate: Date;
  durationMinutes?: number;
  location?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  assignedTo?: string | null;
  syncToCalendar?: boolean;
};

/** Every task in [from, to), for the calendar view. Completed tasks included so past days still render. */
export async function listTasksInRange(from: Date, to: Date) {
  return db.query.tasks.findMany({
    where: (t, { and, gte, lt }) => and(gte(t.dueDate, from), lt(t.dueDate, to)),
    with: { company: true, deal: true, assignee: true },
    orderBy: (t, { asc }) => asc(t.dueDate),
  });
}

/** Open (not completed) tasks due from now onward, for a dashboard-style "what's next" list. */
export async function listUpcomingTasks(limit = 20) {
  return db.query.tasks.findMany({
    where: (t, { isNull }) => isNull(t.completedAt),
    with: { company: true, deal: true },
    orderBy: (t, { asc }) => asc(t.dueDate),
    limit,
  });
}

/**
 * Creates a task and, if requested and Google Calendar sync is
 * configured, mirrors it to Gavin's primary calendar. Calendar sync is
 * best-effort — a failure there never blocks the task itself from being
 * saved, since the CRM's own task list is the source of truth.
 */
export async function createTask(input: TaskInput) {
  const durationMinutes = input.durationMinutes ?? 30;

  const [task] = await db
    .insert(tasks)
    .values({
      description: input.description,
      dueDate: input.dueDate,
      durationMinutes,
      location: input.location || null,
      companyId: input.companyId || null,
      dealId: input.dealId || null,
      assignedTo: input.assignedTo || null,
    })
    .returning();

  if (input.syncToCalendar) {
    const eventId = await createCalendarEvent({
      title: input.description,
      location: input.location,
      startTime: input.dueDate,
      durationMinutes,
    });

    if (eventId) {
      const [updated] = await db
        .update(tasks)
        .set({ googleEventId: eventId, googleEventSyncedAt: new Date() })
        .where(eq(tasks.id, task.id))
        .returning();
      return updated;
    }
  }

  return task;
}

export async function completeTask(id: string) {
  const [task] = await db
    .update(tasks)
    .set({ completedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();
  return task;
}

export async function deleteTask(id: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return null;

  if (task.googleEventId) {
    await deleteCalendarEvent(task.googleEventId);
  }

  await db.delete(tasks).where(eq(tasks.id, id));
  return task;
}

export async function rescheduleTask(
  id: string,
  dueDate: Date,
  durationMinutes?: number
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return null;

  const [updated] = await db
    .update(tasks)
    .set({
      dueDate,
      durationMinutes: durationMinutes ?? task.durationMinutes,
    })
    .where(eq(tasks.id, id))
    .returning();

  if (task.googleEventId) {
    await updateCalendarEvent(task.googleEventId, {
      title: task.description,
      location: task.location,
      startTime: dueDate,
      durationMinutes: durationMinutes ?? task.durationMinutes,
    });
  }

  return updated;
}
