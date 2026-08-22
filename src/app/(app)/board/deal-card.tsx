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
      className={`touch-none rounded-md border border-neutral-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Link
        href={`/companies/${deal.company.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-100"
      >
        {deal.company.name}
      </Link>
      {location && <p className="mt-0.5 text-xs text-neutral-500">{location}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {value && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            {value}
          </span>
        )}
        {deal.company.qualificationScore !== null && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            Score {deal.company.qualificationScore}
          </span>
        )}
        {deal.company.contactTier && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            Tier {deal.company.contactTier}
          </span>
        )}
        {deal.company.googleRating && (
          <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
            {deal.company.googleRating}★ ({deal.company.googleReviewCount || 0})
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
        <span>{days === 0 ? "New today" : `${days}d in stage`}</span>
        {deal.owner && (
          <span
            title={deal.owner.name}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
          >
            {initials(deal.owner.name)}
          </span>
        )}
      </div>
    </div>
  );
}
