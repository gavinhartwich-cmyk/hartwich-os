"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
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

  // A column with a lot of cards (e.g. New Lead) makes the whole page tall
  // enough to scroll — and the browser's own scroll restoration (or scroll
  // anchoring while the deals/columns paint in) tends to leave that scroll
  // sitting wherever it last was, or partway down, instead of at the top.
  // Force it back to the top every time this page mounts, before paint
  // (useLayoutEffect, not useEffect) so there's no visible jump.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // The board's own horizontal scrollbar sits below however tall the
  // longest column happens to be — with 15+ cards in a column, that's
  // deep enough that it's practically undiscoverable. This mirrors it as
  // a second, thin scrollbar pinned right above the columns instead: a
  // spacer div exactly as wide as the real content, kept in sync by
  // driving scrollLeft in whichever direction changed. Doesn't touch the
  // actual board/DndContext markup at all — a CSS-transform trick to
  // flip the real scrollbar to the top would also flip dnd-kit's own
  // translate-based drag positioning inside it, breaking drag-and-drop.
  const topScrollRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);

  useLayoutEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    const measure = () => setContentWidth(el.scrollWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stages, deals, emailDrafts]);

  function syncContentFromTopBar() {
    if (contentScrollRef.current && topScrollRef.current) {
      contentScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }
  function syncTopBarFromContent() {
    if (contentScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = contentScrollRef.current.scrollLeft;
    }
  }

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
      <div
        ref={topScrollRef}
        onScroll={syncContentFromTopBar}
        className="mb-1 h-3 overflow-x-auto overflow-y-hidden"
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div
        ref={contentScrollRef}
        onScroll={syncTopBarFromContent}
        className="flex gap-4 overflow-x-auto pb-4"
      >
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
