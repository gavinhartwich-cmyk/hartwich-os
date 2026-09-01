"use client";

import { useDroppable } from "@dnd-kit/core";
import type { PipelineStage } from "@/lib/data/pipeline-stages";
import type { BoardDeal } from "@/lib/data/deals";
import { formatCurrency } from "@/lib/utils/format";
import DealCard from "./deal-card";

export default function Column({
  stage,
  deals,
}: {
  stage: PipelineStage;
  deals: BoardDeal[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((sum, d) => sum + (d.valueEstimate ? Number(d.valueEstimate) : 0), 0);

  const headerAccent = stage.isWon
    ? "text-emerald-700 dark:text-emerald-400"
    : stage.isLost
      ? "text-neutral-400 dark:text-neutral-500"
      : "text-neutral-700 dark:text-neutral-200";

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className={`text-sm font-semibold ${headerAccent}`}>{stage.name}</h2>
        <span className="text-xs text-neutral-400">
          {deals.length}
          {totalValue > 0 ? ` · ${formatCurrency(totalValue)}` : ""}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-[border-color,background-color,box-shadow] duration-200 ${
          isOver
            ? "border-indigo-400 bg-indigo-50/60 shadow-[inset_0_0_0_1px] shadow-indigo-200 dark:border-indigo-500 dark:bg-indigo-500/10 dark:shadow-indigo-500/20"
            : "border-neutral-200 dark:border-neutral-800"
        }`}
      >
        {deals.map((deal, index) => (
          <DealCard key={deal.id} deal={deal} staggerIndex={index} />
        ))}
        {deals.length === 0 && (
          <p className="animate-fade-in px-1 py-4 text-center text-xs text-neutral-300 dark:text-neutral-600">
            Empty
          </p>
        )}
      </div>
    </div>
  );
}
