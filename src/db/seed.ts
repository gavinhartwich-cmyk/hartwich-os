/**
 * Seeds the default Kanban pipeline stages (architecture doc §6).
 * Stages are data, not code — this just gives the board sane defaults
 * on a fresh database; both are free to rename/reorder/add stages
 * from the UI afterward.
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { pipelineStages, leadSourcesConfig, bookingSettings, bookingQuestions } from "./schema";

const DEFAULT_STAGES = [
  { name: "New Lead", position: 0, isWon: false, isLost: false },
  { name: "Contacted", position: 1, isWon: false, isLost: false },
  { name: "Engaged", position: 2, isWon: false, isLost: false },
  { name: "Meeting Booked", position: 3, isWon: false, isLost: false },
  { name: "Proposal Sent", position: 4, isWon: false, isLost: false },
  { name: "Won", position: 5, isWon: true, isLost: false },
  { name: "Lost", position: 6, isWon: false, isLost: true },
];

async function seedPipelineStages() {
  const existing = await db.select().from(pipelineStages);
  if (existing.length > 0) {
    console.log(`pipeline_stages already has ${existing.length} rows — skipping seed.`);
    return;
  }

  await db.insert(pipelineStages).values(DEFAULT_STAGES);
  console.log(`Seeded ${DEFAULT_STAGES.length} pipeline stages.`);
}

/**
 * Default Google Places lead-source config (Phase 2, architecture doc §5) —
 * the search keyword and franchise-brand blocklist the "Find Leads" workflow
 * falls back to when the form doesn't override them. Both are editable data,
 * not code, straight in this row.
 */
async function seedLeadSourceConfig() {
  const existing = await db
    .select()
    .from(leadSourcesConfig)
    .where(eq(leadSourcesConfig.type, "google_places"));
  if (existing.length > 0) {
    console.log("lead_sources_config already has a google_places row — skipping seed.");
    return;
  }

  await db.insert(leadSourcesConfig).values({
    type: "google_places",
    config: {
      keyword: "HVAC contractor",
      franchiseBlocklist: [],
    },
    isActive: true,
  });
  console.log("Seeded default google_places lead source config.");
}

/**
 * Booking settings (Phase 6) — one row, sane defaults (30 days out, 30-min
 * meetings, Mon–Fri 9–5 Winnipeg time). Editable from /calendar/settings.
 */
async function seedBookingSettings() {
  const existing = await db.select().from(bookingSettings);
  if (existing.length > 0) {
    console.log("booking_settings already seeded — skipping.");
    return;
  }
  await db.insert(bookingSettings).values({});
  console.log("Seeded default booking_settings row.");
}

/**
 * Core questionnaire fields (Phase 6) — name/email/phone always collected
 * so reminders have somewhere to go. isCore=true keeps them from being
 * deleted from the UI; anything else Gavin adds is fully custom.
 */
async function seedBookingQuestions() {
  const existing = await db.select().from(bookingQuestions);
  if (existing.length > 0) {
    console.log(`booking_questions already has ${existing.length} rows — skipping seed.`);
    return;
  }
  await db.insert(bookingQuestions).values([
    { label: "Full name", fieldType: "text", required: true, isCore: true, position: 0 },
    { label: "Email", fieldType: "email", required: true, isCore: true, position: 1 },
    { label: "Phone number", fieldType: "phone", required: true, isCore: true, position: 2 },
    {
      label: "What would you like to talk about?",
      fieldType: "textarea",
      required: false,
      isCore: false,
      position: 3,
    },
  ]);
  console.log("Seeded default booking_questions.");
}

async function main() {
  await seedPipelineStages();
  await seedLeadSourceConfig();
  await seedBookingSettings();
  await seedBookingQuestions();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
