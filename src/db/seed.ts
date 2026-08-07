/**
 * Seeds the default Kanban pipeline stages (architecture doc §6).
 * Stages are data, not code — this just gives the board sane defaults
 * on a fresh database; both are free to rename/reorder/add stages
 * from the UI afterward.
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { db } from "./index";
import { pipelineStages } from "./schema";

const DEFAULT_STAGES = [
  { name: "New Lead", position: 0, isWon: false, isLost: false },
  { name: "Researching", position: 1, isWon: false, isLost: false },
  { name: "Qualified", position: 2, isWon: false, isLost: false },
  { name: "Contacted", position: 3, isWon: false, isLost: false },
  { name: "Engaged", position: 4, isWon: false, isLost: false },
  { name: "Meeting Booked", position: 5, isWon: false, isLost: false },
  { name: "Proposal Sent", position: 6, isWon: false, isLost: false },
  { name: "Won", position: 7, isWon: true, isLost: false },
  { name: "Lost", position: 8, isWon: false, isLost: true },
];

async function main() {
  const existing = await db.select().from(pipelineStages);
  if (existing.length > 0) {
    console.log(`pipeline_stages already has ${existing.length} rows — skipping seed.`);
    return;
  }

  await db.insert(pipelineStages).values(DEFAULT_STAGES);
  console.log(`Seeded ${DEFAULT_STAGES.length} pipeline stages.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
