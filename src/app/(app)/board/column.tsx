"use client";

import { useDroppable } from "@dnd-kit/core";
import type { PipelineStage } from "@/lib/data/pipeline-stages";
import type { BoardDeal } from "@/lib/data/deals";
import { formatCurrency } from "@/lib/utils/format";
import DealCard from "./deal-card";
import Reveal from "@/components/reveal";

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
    ? "text-emerald-300"
    : stage.isLost
      ? "text-white/30"
      : "text-white/70";

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className={`text-sm font-medium ${headerAccent}`}>{stage.name}</h2>
        <span className="text-xs text-white/30">
          {deals.length}
          {totalValue > 0 ? ` · ${formatCurrency(totalValue)}` : ""}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-all duration-150 ${
          isOver ? "scale-[1.01] border-white/30 bg-white/[0.04]" : "border-white/10"
        }`}
      >
        {deals.map((deal, i) => (
          <Reveal key={deal.id} delay={Math.min(i, 8) * 45}>
            <DealCard deal={deal} />
          </Reveal>
        ))}
        {deals.length === 0 && <p className="px-1 py-4 text-center text-xs text-white/20">Empty</p>}
      </div>
    </div>
  );
}
