import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Phase 0 — foundations
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Hartwich OS is live</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Signed in as {user?.email ?? "unknown"}. Auth, database schema, and the
          deploy pipeline are wired up — the CRM board, lead mining, and outreach
          tools from the architecture doc build on top of this.
        </p>
      </div>
      <SignOutButton />
    </main>
  );
}
