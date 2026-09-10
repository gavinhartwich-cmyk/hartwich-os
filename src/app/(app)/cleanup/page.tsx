"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle } from "lucide-react";

type Stats = {
  qualified: number;
  disqualified: number;
  needsReview: number;
  total: number;
};

type AccountWarmupStatus = {
  accountIndex: 0 | 1 | 2;
  fromAddress: string | null;
  warmupStatus: string;
  activeSendDays: number;
  dailyLimit: number | null;
  sentToday: number;
  lastSentAt: string | null;
  complete: boolean;
  configured: boolean;
};

const WARMUP_TOTAL_RAMP_DAYS = 29;

export default function CleanupPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [warmup, setWarmup] = useState<AccountWarmupStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [done, setDone] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  useEffect(() => {
    fetchStats();
    fetchWarmup();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/cleanup/leads");
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWarmup() {
    try {
      const res = await fetch("/api/cleanup/warmup");
      const data = await res.json();
      setWarmup(data.accounts);
    } catch (error) {
      console.error("Failed to fetch warm-up status:", error);
    }
  }

  async function runCleanup() {
    if (!confirm("Delete all disqualified leads? Leads needing review will be kept.")) {
      return;
    }

    setCleaning(true);
    try {
      const res = await fetch("/api/cleanup/leads", { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        setDeletedCount(data.deletedCount);
        setDone(true);
        // Refresh stats
        setTimeout(fetchStats, 1000);
      } else {
        alert("Cleanup failed: " + data.error);
      }
    } catch (error) {
      alert("Error during cleanup: " + (error instanceof Error ? error.message : "Unknown"));
    } finally {
      setCleaning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl fade-in">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link href="/board" className="btn-ghost rounded-lg p-2">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-3xl font-light tracking-tight text-white">Database Cleanup</h1>
        </div>

        {/* Email warm-up */}
        <div className="surface-card mb-6 p-6">
          <h2 className="font-semibold text-white">Email warm-up</h2>
          <p className="mt-1 text-sm text-white/70">
            Per-account sending ramp — a fresh Gmail account is deliberately capped well below
            Gmail&apos;s own limit while it builds sender reputation. Progress counts days the
            mailbox actually sent on (AI agents included, since they use these same mailboxes), so
            an idle day doesn&apos;t advance the ramp.
          </p>
          {!warmup ? (
            <p className="mt-4 text-sm text-white/50">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {warmup.map((a) => {
                const dayLabel = a.complete
                  ? "Warmed up"
                  : `Sending day ${a.activeSendDays} of ${WARMUP_TOTAL_RAMP_DAYS}`;
                const limitLabel = a.dailyLimit === null ? "no daily cap" : `${a.dailyLimit}/day`;
                const progressPct = a.complete
                  ? 100
                  : Math.min(100, Math.round((a.activeSendDays / WARMUP_TOTAL_RAMP_DAYS) * 100));
                return (
                  <div key={a.accountIndex} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="truncate text-sm font-medium text-white">
                      {a.fromAddress ?? `Account ${a.accountIndex + 1}`}
                    </p>
                    {!a.configured && (
                      <p className="mt-1 text-xs text-red-400">GMAIL_REFRESH_TOKEN not set</p>
                    )}
                    <p className="mt-2 text-xs text-white/50">{dayLabel}</p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${a.complete ? "bg-emerald-400" : "bg-sky-400"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      {a.sentToday} sent today
                      <span className="text-white/40"> · {limitLabel}</span>
                    </p>
                    {a.lastSentAt && (
                      <p className="mt-1 text-xs text-white/40">
                        Last sent {new Date(a.lastSentAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!done ? (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                  Qualified Leads
                </p>
                <p className="mt-1 text-3xl font-light text-white">
                  {stats?.qualified || 0}
                </p>
                <p className="mt-1 text-xs text-emerald-300/70">Ready to board</p>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-400">
                  Needs Review
                </p>
                <p className="mt-1 text-3xl font-light text-white">
                  {stats?.needsReview || 0}
                </p>
                <p className="mt-1 text-xs text-amber-300/70">Kept — awaiting your review</p>
              </div>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-red-400">
                  Disqualified
                </p>
                <p className="mt-1 text-3xl font-light text-white">
                  {stats?.disqualified || 0}
                </p>
                <p className="mt-1 text-xs text-red-300/70">Will be deleted</p>
              </div>
            </div>

            {/* Summary */}
            <div className="surface-card p-6">
              <div className="flex gap-4">
                <AlertTriangle className="size-6 shrink-0 text-amber-400" />
                <div>
                  <h2 className="font-semibold text-white">Clean Reset</h2>
                  <p className="mt-1 text-sm text-white/70">
                    This will permanently delete <strong>{stats?.disqualified || 0}</strong> disqualified leads.
                  </p>
                  <p className="mt-2 text-sm text-white/70">
                    <strong>{stats?.qualified || 0}</strong> qualified leads and{" "}
                    <strong>{stats?.needsReview || 0}</strong> awaiting review will be kept.
                  </p>
                </div>
              </div>
            </div>

            {/* Cleanup Button */}
            <div className="flex gap-3">
              <button
                onClick={runCleanup}
                disabled={cleaning || !stats || stats.disqualified === 0}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:bg-red-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {cleaning ? (
                  <>
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  "Run Cleanup"
                )}
              </button>
              <Link
                href="/board"
                className="btn-secondary"
              >
                Cancel
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6 fade-in">
            {/* Success Message */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6">
              <div className="flex gap-4">
                <CheckCircle className="size-6 shrink-0 text-emerald-400" />
                <div>
                  <h2 className="font-semibold text-white">Cleanup Complete</h2>
                  <p className="mt-1 text-sm text-emerald-300/80">
                    Deleted <strong>{deletedCount}</strong> leads. Your database is now clean.
                  </p>
                  <p className="mt-2 text-sm text-emerald-300/80">
                    You have <strong>{stats?.qualified || 0}</strong> qualified leads on your board ready to outreach.
                  </p>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="surface-card p-6">
              <h3 className="font-semibold text-white">Next Steps</h3>
              <ol className="mt-3 space-y-2 text-sm text-white/70">
                <li>
                  1. Visit{" "}
                  <Link href="/leads/find" className="text-white underline underline-offset-2 hover:text-white/80">
                    Find Leads
                  </Link>{" "}
                  to discover HVAC companies
                </li>
                <li>
                  2. Open a qualified company and use{" "}
                  <span className="font-medium text-white">Draft outreach email</span> on its page — it
                  writes from that company&apos;s own research, no separate tool needed
                </li>
                <li>3. Send cold emails and track responses</li>
              </ol>
            </div>

            {/* Back to Board */}
            <Link href="/board" className="btn-primary block text-center">
              Back to Board
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
