"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/board", label: "Board" },
  { href: "/calendar", label: "Calendar" },
  { href: "/companies", label: "Companies" },
  { href: "/leads/review", label: "Review Queue" },
  { href: "/cleanup", label: "Cleanup" },
];

// Gavin-only (see lib/auth/allowlist.ts isBookingAdmin) — Noah doesn't need
// booking link/settings, so the layout only passes this when it applies.
const BOOKING_ADMIN_LINK = { href: "/calendar/settings", label: "Booking" };

export default function NavLinks({
  showBookingAdmin = false,
  stacked = false,
  onNavigate,
}: {
  showBookingAdmin?: boolean;
  /** Full-width vertical list for the mobile menu, instead of the desktop pill row. */
  stacked?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = showBookingAdmin ? [...LINKS, BOOKING_ADMIN_LINK] : LINKS;

  return (
    <nav className={stacked ? "flex flex-col gap-1" : "flex items-center gap-1"}>
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={
              stacked
                ? `rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    active
                      ? "bg-white text-black"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                  }`
                : `rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                    active
                      ? "bg-white text-black shadow-[0_0_16px_rgba(255,255,255,0.2)]"
                      : "text-white/50 hover:bg-white/[0.06] hover:text-white/90"
                  }`
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
