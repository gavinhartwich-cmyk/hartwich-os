"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FormField from "@/components/form-field";
import AmbientOrb from "@/components/ambient-orb";

function LoginError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  if (error === "not_allowed") {
    return (
      <p className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300">
        That account isn&apos;t authorized for Hartwich OS.
      </p>
    );
  }
  if (error === "auth_failed") {
    return (
      <p className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300">
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[var(--background)] px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.08), transparent)",
        }}
      />
      <AmbientOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-70" />

      <div className="fade-in surface-card relative w-full max-w-sm space-y-6 p-8 text-center">
        <div>
          <span className="mb-3 inline-block rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium tracking-[0.15em] text-white/40 uppercase">
            Internal Access
          </span>
          <h1 className="text-2xl font-light tracking-tight text-white">
            Hartwich <span className="text-white/40">OS</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Internal sales operating system</p>
        </div>

        <Suspense fallback={null}>
          <LoginError />
        </Suspense>

        <LoginForm />

        <p className="text-xs text-white/25">Access is limited to Hartwich Labs admins.</p>
      </div>
    </main>
  );
}
