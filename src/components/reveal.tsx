"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-triggered fade-in-up wrapper — content stays hidden until it
 * scrolls into view (or mounts), then eases in once with a bit of spring
 * overshoot so it feels snappy rather than sleepy. Used across the app so
 * long pages (board, companies list, leads) feel alive instead of just
 * dumping everything on-screen at once.
 *
 * `delay` staggers siblings (e.g. index * 45) for a cascading reveal —
 * applies whether the item starts above or below the fold.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const show = () => setVisible(true);

    // Already in view on mount (above the fold) — still animate in, just
    // don't wait for a scroll event that will never come. The stagger
    // delay still applies so a list of cards cascades in together.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      const t = setTimeout(show, delay);
      return () => clearTimeout(t);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-[420ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
        visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[0.97] opacity-0"
      } ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
