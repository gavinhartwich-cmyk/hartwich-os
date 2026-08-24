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

export default function NavLinks({ showBookingAdmin = false }: { showBookingAdmin?: boolean }) {
  const pathname = usePathname();
  const links = showBookingAdmin ? [...LINKS, BOOKING_ADMIN_LINK] : LINKS;

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
