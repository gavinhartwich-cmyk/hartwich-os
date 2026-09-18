import Link from "next/link";
import { listPipelineStages } from "@/lib/data/pipeline-stages";
import { listDealsForBoard } from "@/lib/data/deals";
import { listPendingEmailDrafts } from "@/lib/data/email-drafts";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import Board from "../../board/board";

/**
 * The same Kanban board component as /board, filtered to companies the AI
 * Workforce discovered on its own (company.aiWorkforceCreated) — split
 * into its own view so the two didn't sit crammed into one column set
 * (Gavin, 2026-09-15: "too cluttered"). Nothing is deduped or merged
 * between the two boards; a company can still be worked by both, this
 * only decides which view it renders in.
 */
export default async function AiWorkforceBoardPage() {
  const [stages, deals, emailDrafts, currentUser] = await Promise.all([
    listPipelineStages(),
    listDealsForBoard("ai"),
    listPendingEmailDrafts(),
    getCurrentAppUser(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/ai-workforce"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-white"
          >
            ← AI Workforce
          </Link>
          <h1 className="text-xl font-light tracking-tight text-white">AI Board</h1>
          <p className="text-sm text-[var(--muted)]">
            Companies the AI Workforce found and is working on its own — see{" "}
            <Link href="/board" className="underline hover:text-white">
              the main pipeline
            </Link>{" "}
            for manually-found leads.
          </p>
        </div>
      </div>

      {stages.length === 0 ? (
        <p className="surface-card border-dashed p-6 text-sm text-[var(--muted)]">
          No pipeline stages found. Run <code className="font-mono">npm run db:seed</code> to create
          the default stages, then refresh.
        </p>
      ) : (
        <Board
          stages={stages}
          initialDeals={deals}
          emailDrafts={emailDrafts}
          currentUserId={currentUser?.id ?? ""}
          users={[]}
        />
      )}
    </div>
  );
}
