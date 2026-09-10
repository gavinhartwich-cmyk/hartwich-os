import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import AmbientOrb from "@/components/ambient-orb";

export type NodeStatus = "active" | "idle" | "never" | "paused";

export type HubNode = {
  key: string;
  label: string;
  sublabel: string;
  icon: LucideIcon;
  status: NodeStatus;
};

const STATUS_STYLES: Record<NodeStatus, { border: string; text: string; dot: string; label: string }> = {
  active: { border: "border-emerald-400/40", text: "text-emerald-300", dot: "bg-emerald-400", label: "Active" },
  idle: { border: "border-amber-400/40", text: "text-amber-300", dot: "bg-amber-400", label: "Idle" },
  paused: { border: "border-rose-400/40", text: "text-rose-300", dot: "bg-rose-400", label: "Paused" },
  never: { border: "border-white/[0.12]", text: "text-white/40", dot: "bg-white/25", label: "Not run yet" },
};

// Percentage coordinates for a 6-node hub, matching a clock-face layout
// (top-left/top-right, left/right, bottom-left/bottom-right) so the SVG
// connector lines and the absolutely-positioned cards agree on geometry.
const POSITIONS = [
  { top: "8%", left: "6%" }, // 0: top-left
  { top: "8%", left: "94%" }, // 1: top-right
  { top: "50%", left: "0%" }, // 2: left
  { top: "50%", left: "100%" }, // 3: right
  { top: "92%", left: "6%" }, // 4: bottom-left
  { top: "92%", left: "94%" }, // 5: bottom-right
];

function NodeCard({ node }: { node: HubNode }) {
  const style = STATUS_STYLES[node.status];
  const Icon = node.icon;
  return (
    <Link
      href={`/ai-workforce/${node.key}`}
      className={`surface-card surface-card-hover flex items-center gap-2.5 border px-3 py-2.5 transition-transform duration-150 ease-[var(--ease-spring)] hover:scale-[1.03] ${style.border}`}
      style={{ width: 168 }}
    >
      <Icon className={`size-4 shrink-0 ${style.text}`} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white/90">{node.label}</p>
        <p className={`flex items-center gap-1 text-[11px] ${style.text}`}>
          <span className={`size-1.5 rounded-full ${style.dot}`} />
          {node.sublabel}
        </p>
      </div>
    </Link>
  );
}

/**
 * The hub-and-spoke overview (desktop): six capability nodes around a
 * central status orb, each connected by a hairline. Below `md` this
 * collapses to a plain grid — six absolutely-positioned cards and an SVG
 * overlay don't reflow onto a phone screen, so it isn't attempted there,
 * same "richer on desktop, list on mobile" split as src/app/(app)/companies.
 */
export default function HubDiagram({
  hub,
  nodes,
}: {
  hub: { label: string; sublabel: string; status: NodeStatus };
  nodes: HubNode[]; // exactly 6, in POSITIONS order
}) {
  const hubStyle = STATUS_STYLES[hub.status];

  return (
    <div className="surface-card p-6">
      {/* Desktop hub-and-spoke */}
      <div className="relative mx-auto hidden aspect-square max-w-xl md:block">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {POSITIONS.map((pos, i) => (
            <line
              key={i}
              x1="50%"
              y1="50%"
              x2={pos.left}
              y2={pos.top}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
        </svg>

        <AmbientOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />

        <div
          className={`absolute left-1/2 top-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border ${hubStyle.border} bg-[var(--surface)] text-center`}
        >
          <span className={`mb-1 size-2 rounded-full ${hubStyle.dot}`} style={{ animation: "pulse-glow 2.4s ease-in-out infinite" }} />
          <p className="text-xs font-semibold tracking-wide text-white/90">{hub.label}</p>
          <p className={`text-[10px] ${hubStyle.text}`}>{hub.sublabel}</p>
        </div>

        {nodes.map((node, i) => (
          <div
            key={node.key}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top: POSITIONS[i].top, left: POSITIONS[i].left }}
          >
            <NodeCard node={node} />
          </div>
        ))}
      </div>

      {/* Mobile: plain grid, no lines/orb */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:hidden">
        {nodes.map((node) => (
          <NodeCard key={node.key} node={node} />
        ))}
      </div>
    </div>
  );
}
