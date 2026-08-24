"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import NavLinks from "@/components/nav-links";
import SignOutButton from "@/components/sign-out-button";

/**
 * Authenticated app shell header. Desktop shows the horizontal pill nav
 * inline; below `md` it collapses behind a hamburger button into a
 * full-width dropdown so the nav never overflows a phone screen.
 */
export default function AppHeader({
  userName,
  showBookingAdmin,
}: {
  userName: string;
  showBookingAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium tracking-tight text-white/90">
            Hartwich <span className="text-white/40">OS</span>
          </span>
          <div className="hidden md:block">
            <NavLinks showBookingAdmin={showBookingAdmin} />
          </div>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <span className="text-sm text-[var(--muted)]">{userName}</span>
          <SignOutButton className="btn-ghost" />
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="fade-in border-t border-white/[0.08] px-4 py-3 md:hidden">
          <NavLinks showBookingAdmin={showBookingAdmin} stacked onNavigate={() => setOpen(false)} />
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3">
            <span className="text-sm text-[var(--muted)]">{userName}</span>
            <SignOutButton className="btn-ghost" />
          </div>
        </div>
      )}
    </header>
  );
}
