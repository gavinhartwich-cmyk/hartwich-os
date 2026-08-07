"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="w-fit rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
    >
      Sign out
    </button>
  );
}
