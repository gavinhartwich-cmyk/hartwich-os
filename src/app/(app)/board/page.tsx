import Link from "next/link";
import { listPipelineStages } from "@/lib/data/pipeline-stages";
import { listDealsForBoard } from "@/lib/data/deals";
import { getCurrentAppUser, listAppUsers } from "@/lib/auth/current-user";
import Board from "./board";

// Pending-draft review lives only on the AI board (see
// app/(app)/ai-workforce/board/page.tsx) — this board is manually-worked
// leads, and reviewing AI-drafted follow-ups doesn't belong mixed into that
// (Gavin, 2026-09-20). Passing an empty array rather than making the prop
// optional keeps Board's rendering logic identical either way.
export default async function BoardPage() {
  const [stages, deals, currentUser, users] = await Promise.all([
    listPipelineStages(),
    listDealsForBoard("manual"),
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
          emailDrafts={[]}
          currentUserId={currentUser?.id ?? ""}
          users={users.map((u) => ({ id: u.id, name: u.name }))}
        />
      )}
    </div>
  );
}
