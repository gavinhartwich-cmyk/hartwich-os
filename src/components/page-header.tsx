import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared hero-style header for every top-level screen (board, companies,
 * leads, calendar, ...) — big, bold title with a live ambient glow and a
 * quick spring entrance, so every page opens with the same cinematic
 * feel as the login screen, without going so big it eats into room the
 * data below needs.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="fade-in relative mb-10 sm:mb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 h-64 w-[28rem] opacity-70 animate-[pulse-glow_5s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(ellipse 60% 60% at 30% 30%, rgba(255,255,255,0.14), transparent)",
        }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          {back && (
            <Link
              href={back.href}
              className="group mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] transition-all duration-150 ease-[var(--ease-spring)] hover:gap-1.5 hover:text-white"
            >
              <span className="transition-transform duration-150 ease-[var(--ease-spring)] group-hover:-translate-x-0.5">←</span>
              {back.label}
            </Link>
          )}
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl md:text-6xl">
            {title}
          </h1>
          {subtitle && (
            <p
              className="fade-in mt-3 max-w-xl text-sm text-[var(--muted)] sm:text-base"
              style={{ animationDelay: "80ms" }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action && (
          <div className="fade-in shrink-0" style={{ animationDelay: "140ms" }}>
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
