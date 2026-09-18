import Link from "next/link";
import { listPipelineStages } from "@/lib/data/pipeline-stages";
import { listDealsForBoard } from "@/lib/data/deals";
import { listPendingEmailDrafts } from "@/lib/data/email-drafts";
import { getCurrentAppUser, listAppUsers } from "@/lib/auth/current-user";
import Board from "./board";

export default async function BoardPage() {
  const [stages, deals, emailDrafts, currentUser, users] = await Promise.all([
    listPipelineStages(),
    listDealsForBoard("manual"),
    listPendingEmailDrafts(),
    getCurrentAppUser(),
    listAppUsers(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-light tracking-tight text-white">Pipeline</h1>
          <p className="text-sm text-[var(--muted)]">
            Drag a card to move it between stages. Manually-found leads — see{" "}
            <Link href="/ai-workforce/board" className="underline hover:text-white">
              the AI board
            </Link>{" "}
            for what the AI Workforce discovered on its own.
          </p>
        </div>
        <Link href="/companies/new" className="btn-primary">
          + New Company
        </Link>
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
          users={users.map((u) => ({ id: u.id, name: u.name }))}
        />
      )}
    </div>
  );
}
