import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import NavLinks from "@/components/nav-links";
import SignOutButton from "@/components/sign-out-button";

/**
 * Shared shell for every authenticated page (board, companies, ...).
 * proxy.ts already blocks unauthenticated/non-allow-listed requests
 * before they reach here; this redirect is the defensive fallback for
 * the case getCurrentAppUser() can't resolve a row (e.g. mid-signout).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium tracking-tight text-white/90">
              Hartwich <span className="text-white/40">OS</span>
            </span>
            <NavLinks showBookingAdmin={isBookingAdmin(user.email)} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--muted)]">{user.name}</span>
            <SignOutButton className="btn-ghost" />
          </div>
        </div>
      </header>
      <main className="fade-in mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
