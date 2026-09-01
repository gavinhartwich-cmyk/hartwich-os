"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FormField from "@/components/form-field";

function LoginError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  if (error === "not_allowed") {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        That account isn&apos;t authorized for Hartwich OS.
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

function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Incorrect email or password.");
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <FormField label="Email" name="email" type="email" required autoFocus />
      <FormField label="Password" name="password" type="password" required />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        data-animate-press
        className="w-full rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-500/30 hover:shadow-md hover:shadow-indigo-500/40 disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="animate-scale-in w-full max-w-sm space-y-6 rounded-2xl border border-neutral-200/80 bg-white/70 p-8 text-center shadow-xl shadow-neutral-900/5 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-900/60 dark:shadow-black/20">
        <div>
          <h1 className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-2xl font-semibold text-transparent">
            Hartwich OS
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Internal sales operating system</p>
        </div>

        <Suspense fallback={null}>
          <LoginError />
        </Suspense>

        <LoginForm />

        <p className="text-xs text-neutral-400">
          Access is limited to Hartwich Labs admins.
        </p>
      </div>
    </main>
  );
}
