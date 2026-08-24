import { listCompanies } from "@/lib/data/companies";
import CalendarClient from "./calendar-client";

/**
 * Follow-up / meeting calendar (Phase 5). Backed by the `tasks` table —
 * a task with a due date and duration *is* a calendar entry here, so
 * this reuses the existing table instead of adding a parallel
 * `meetings` concept. Optionally mirrors to Google Calendar via
 * src/lib/integrations/google-calendar.ts when GOOGLE_CALENDAR_* env
 * vars are set — see .env.example.
 */
export default async function CalendarPage() {
  const companies = await listCompanies();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <p className="text-sm text-[var(--muted)]">
          Follow-ups and meetings, tied to a company/deal where relevant.
        </p>
      </div>
      <CalendarClient
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
