import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import AppHeader from "@/components/app-header";

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
      <AppHeader userName={user.name} showBookingAdmin={isBookingAdmin(user.email)} />
      <main className="fade-in mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
