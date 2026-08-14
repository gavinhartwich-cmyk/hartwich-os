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
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
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

        <LoginForm />

        <p className="text-xs text-neutral-400">
          Access is limited to Hartwich Labs admins.
        </p>
      </div>
    </main>
  );
}
