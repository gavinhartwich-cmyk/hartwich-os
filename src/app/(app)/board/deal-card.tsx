"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { BoardDeal } from "@/lib/data/deals";
import { cityState, daysSince, formatCurrency, initials } from "@/lib/utils/format";

export default function DealCard({ deal }: { deal: BoardDeal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const location = cityState(deal.company.city, deal.company.state);
  const value = formatCurrency(deal.valueEstimate);
  const days = daysSince(deal.stageEnteredAt);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      suppressHydrationWarning
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`surface-card touch-none p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.03] ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Link
        href={`/companies/${deal.company.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm font-medium text-white/90 hover:underline"
      >
        {deal.company.name}
      </Link>
      {location && <p className="mt-0.5 text-xs text-[var(--muted)]">{location}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {value && (
          <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
            {value}
          </span>
        )}
        {deal.company.qualificationScore !== null && (
          <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-inset ring-sky-400/20">
            Score {deal.company.qualificationScore}
          </span>
        )}
        {deal.company.contactTier && (
          <span className="rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-white/50 ring-1 ring-inset ring-white/10">
            Tier {deal.company.contactTier}
          </span>
        )}
        {deal.company.googleRating && (
          <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/20">
            {deal.company.googleRating}★ ({deal.company.googleReviewCount || 0})
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/30">
        <span>{days === 0 ? "New today" : `${days}d in stage`}</span>
        {deal.owner && (
          <span
            title={deal.owner.name}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08] font-medium text-white/60"
          >
            {initials(deal.owner.name)}
          </span>
        )}
      </div>
    </div>
  );
}
