import "server-only";
import { google } from "googleapis";

/**
 * Google Calendar sync for CRM tasks/meetings (Phase 5).
 *
 * Single-account (Gavin's own calendar) — this is an internal CRM, not
 * outreach infrastructure, so there's no need for the round-robin
 * multi-account pattern gmail-multi.ts uses. Same OAuth shape though:
 * a client id/secret pair plus a long-lived access+refresh token,
 * generated once via Google Cloud Console and stored as env vars.
 *
 * Requires: GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET,
 * GOOGLE_CALENDAR_ACCESS_TOKEN, GOOGLE_CALENDAR_REFRESH_TOKEN.
 * No-ops (returns null) when unset, so calendar sync is fully optional —
 * the CRM's own task list works with or without it.
 */

function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  );
}

function getCalendarClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET || ""
  );

  auth.setCredentials({
    access_token: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  });

  return google.calendar({ version: "v3", auth });
}

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startTime: Date;
  durationMinutes: number;
};

/**
 * Creates a calendar event and returns its id, or null if Calendar sync
 * isn't configured yet. Callers should treat null as "skipped, not
 * failed" — task creation should never block on this.
 */
export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<string | null> {
  if (!isConfigured()) return null;

  try {
    const calendar = getCalendarClient();
    const endTime = new Date(
      input.startTime.getTime() + input.durationMinutes * 60_000
    );

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.title,
        description: input.description || undefined,
        location: input.location || undefined,
        start: { dateTime: input.startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
    });

    return response.data.id || null;
  } catch (error) {
    console.error("Failed to create Google Calendar event:", error);
    return null;
  }
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput
): Promise<boolean> {
  if (!isConfigured()) return false;

  try {
    const calendar = getCalendarClient();
    const endTime = new Date(
      input.startTime.getTime() + input.durationMinutes * 60_000
    );

    await calendar.events.update({
      calendarId: "primary",
      eventId,
      requestBody: {
        summary: input.title,
        description: input.description || undefined,
        location: input.location || undefined,
        start: { dateTime: input.startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
    });

    return true;
  } catch (error) {
    console.error("Failed to update Google Calendar event:", error);
    return false;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  if (!isConfigured()) return false;

  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({ calendarId: "primary", eventId });
    return true;
  } catch (error) {
    console.error("Failed to delete Google Calendar event:", error);
    return false;
  }
}

export function isCalendarSyncConfigured(): boolean {
  return isConfigured();
}
