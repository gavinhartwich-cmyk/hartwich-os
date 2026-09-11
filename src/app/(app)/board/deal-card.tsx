"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { BoardDeal, OutreachState } from "@/lib/data/deals";
import { cityState, daysSince, formatCurrency, initials } from "@/lib/utils/format";

/**
 * The outreach state, said on the card so you don't open a deal just to
 * find out where it stands. Colour carries "does this need me?": amber and
 * rose do, emerald is handled, sky is waiting. Sent and Delivered stay
 * separate on purpose — Delivered is the one that means stop wondering
 * whether it actually arrived.
 */
const OUTREACH_BADGE: Record<Exclude<OutreachState, "none">, { label: string; className: string; title: string }> = {
  replied: {
    label: "Replied",
    className: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    title: "They replied — this one needs you",
  },
  bounced: {
    label: "Bounced",
    className: "bg-rose-400/10 text-rose-300 ring-rose-400/20",
    title: "The last email bounced — the address is probably wrong",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    title: "Confirmed delivered — nothing to do but wait",
  },
  sent: {
    label: "Sent",
    className: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
    title: "Sent, delivery not yet confirmed",
  },
};

export default function DealCard({ deal }: { deal: BoardDeal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const location = cityState(deal.company.city, deal.company.state);
  const value = formatCurrency(deal.valueEstimate);
  const days = daysSince(deal.stageEnteredAt);
  // How long since the outreach event the badge names — "Sent · 6d" is the
  // difference between "wait" and "chase", without opening the deal.
  const outreachDays = deal.outreach.at ? daysSince(deal.outreach.at) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      suppressHydrationWarning
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`surface-card touch-none p-3 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.03] hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.6)] ${
        isDragging ? "scale-[1.03] opacity-90 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)]" : ""
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
        {/* First in the row: this is the thing you're scanning the board for. */}
        {deal.outreach.state === "none" ? (
          <span
            title="No outreach sent yet"
            className="rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-white/40 ring-1 ring-inset ring-white/10"
          >
            Not contacted
          </span>
        ) : (
          <span
            title={OUTREACH_BADGE[deal.outreach.state].title}
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
              OUTREACH_BADGE[deal.outreach.state].className
            }`}
          >
            {OUTREACH_BADGE[deal.outreach.state].label}
            {outreachDays !== null && (
              <span className="opacity-60"> · {outreachDays === 0 ? "today" : `${outreachDays}d`}</span>
            )}
          </span>
        )}
        {deal.company.aiWorkforceCreated && (
          <span
            title="Discovered and added autonomously by the AI Workforce — not a manual or Noah-run lead"
            className="rounded-full bg-violet-400/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-400/20"
          >
            AI
          </span>
        )}
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
