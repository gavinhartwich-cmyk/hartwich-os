"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

async function signInWithGoogle() {
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

function LoginError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  if (error === "not_allowed") {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        That Google account isn&apos;t authorized for Hartwich OS.
      </p>
    );
  }
  if (error === "auth_failed") {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        Sign-in failed. Please try again.
      </p>
    );
  }
  return null;
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Hartwich OS</h1>
          <p className="mt-1 text-sm text-neutral-500">Internal sales operating system</p>
        </div>

        <Suspense fallback={null}>
          <LoginError />
        </Suspense>

        <button
          onClick={signInWithGoogle}
          className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Continue with Google
        </button>

        <p className="text-xs text-neutral-400">
          Access is limited to Hartwich Labs admins.
        </p>
      </div>
    </main>
  );
}
