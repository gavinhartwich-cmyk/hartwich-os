import Link from "next/link";
import { listPipelineStages } from "@/lib/data/pipeline-stages";
import { listDealsForBoard } from "@/lib/data/deals";
import { listPendingEmailDrafts } from "@/lib/data/email-drafts";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import Board from "./board";

export default async function BoardPage() {
  const [stages, deals, emailDrafts, currentUser] = await Promise.all([
    listPipelineStages(),
    listDealsForBoard(),
    listPendingEmailDrafts(),
    getCurrentAppUser(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-light tracking-tight text-white">Pipeline</h1>
          <p className="text-sm text-[var(--muted)]">Drag a card to move it between stages.</p>
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
        />
      )}
    </div>
  );
}
