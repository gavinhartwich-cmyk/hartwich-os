import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-user";
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-200/80 bg-white/70 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-950/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-sm font-semibold tracking-tight text-transparent">
              Hartwich OS
            </span>
            <NavLinks />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">{user.name}</span>
            <SignOutButton className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 animate-fade-in-up">{children}</main>
    </div>
  );
}
