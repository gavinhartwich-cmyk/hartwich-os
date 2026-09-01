/**
 * Decorative ghostly wireframe-orb, in the spirit of the Norch reference
 * (concentric glowing rings against pure black) — pure CSS, no images.
 * Purely decorative: aria-hidden, pointer-events disabled.
 */
export default function AmbientOrb({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${className}`}
      style={{ width: 520, height: 520 }}
    >
      <div className="absolute inset-0 animate-[spin_60s_linear_infinite] rounded-full border border-white/[0.07]" />
      <div
        className="absolute inset-[12%] animate-[spin_46s_linear_infinite_reverse] rounded-full border border-white/[0.06]"
        style={{ animationDirection: "reverse" }}
      />
      <div className="absolute inset-[24%] animate-[spin_38s_linear_infinite] rounded-full border border-white/[0.05]" />
      <div className="absolute inset-[38%] rounded-full border border-white/[0.08]" />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10), transparent 65%)",
          animation: "pulse-glow 6s ease-in-out infinite",
        }}
      />
    </div>
  );
}
