"use client";

import { useState, useTransition } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import type { PipelineStage } from "@/lib/data/pipeline-stages";
import type { BoardDeal } from "@/lib/data/deals";
import type { PendingEmailDraft } from "@/lib/data/email-drafts";
import { moveDealAction } from "./actions";
import Column from "./column";
import DealCard from "./deal-card";
import EmailReviewColumn from "./email-review-column";

export default function Board({
  stages,
  initialDeals,
  emailDrafts,
  currentUserId,
}: {
  stages: PipelineStage[];
  initialDeals: BoardDeal[];
  emailDrafts: PendingEmailDraft[];
  currentUserId: string;
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [activeDeal, setActiveDeal] = useState<BoardDeal | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    const deal = deals.find((d) => d.id === event.active.id);
    setActiveDeal(deal ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const targetStageId = over.id as string;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === targetStageId) return;

    const previousDeals = deals;
    setDeals((current) =>
      current.map((d) =>
        d.id === dealId ? { ...d, stageId: targetStageId, stageEnteredAt: new Date() } : d
      )
    );

    startTransition(async () => {
      try {
        await moveDealAction(dealId, targetStageId);
      } catch {
        setDeals(previousDeals);
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {emailDrafts.length > 0 && (
          <EmailReviewColumn drafts={emailDrafts} currentUserId={currentUserId} />
        )}
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} deals={deals.filter((d) => d.stageId === stage.id)} />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? (
          <div className="rotate-2 scale-105 opacity-95 drop-shadow-2xl">
            <DealCard deal={activeDeal} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
