import Link from "next/link";
import { listPipelineStages } from "@/lib/data/pipeline-stages";
import { listDealsForBoard } from "@/lib/data/deals";
import { listPendingEmailDrafts } from "@/lib/data/email-drafts";
import Board from "./board";

export default async function BoardPage() {
  const [stages, deals, emailDrafts] = await Promise.all([
    listPipelineStages(),
    listDealsForBoard(),
    listPendingEmailDrafts(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-sm text-neutral-500">Drag a card to move it between stages.</p>
        </div>
        <Link
          href="/companies/new"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          + New Company
        </Link>
      </div>

      {stages.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
          No pipeline stages found. Run <code className="font-mono">npm run db:seed</code> to create
          the default stages, then refresh.
        </p>
      ) : (
        <Board stages={stages} initialDeals={deals} emailDrafts={emailDrafts} />
      )}
    </div>
  );
}
