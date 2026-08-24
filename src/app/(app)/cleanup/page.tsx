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

export default function CleanupPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [done, setDone] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  useEffect(() => {
    fetchStats();
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
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100 p-6 dark:from-neutral-900 dark:to-neutral-950">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link href="/board" className="rounded-lg p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-3xl font-bold">Database Cleanup</h1>
        </div>

        {!done ? (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                <p className="text-xs font-medium uppercase tracking-wide text-green-600 dark:text-green-400">
                  Qualified Leads
                </p>
                <p className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
                  {stats?.qualified || 0}
                </p>
                <p className="mt-1 text-xs text-green-700 dark:text-green-300">Ready to board</p>
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
                <p className="text-xs font-medium uppercase tracking-wide text-yellow-600 dark:text-yellow-400">
                  Needs Review
                </p>
                <p className="mt-1 text-3xl font-bold text-yellow-900 dark:text-yellow-100">
                  {stats?.needsReview || 0}
                </p>
                <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">Kept — awaiting your review</p>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
                  Disqualified
                </p>
                <p className="mt-1 text-3xl font-bold text-red-900 dark:text-red-100">
                  {stats?.disqualified || 0}
                </p>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">Will be deleted</p>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex gap-4">
                <AlertTriangle className="size-6 shrink-0 text-amber-600" />
                <div>
                  <h2 className="font-semibold">Clean Reset</h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    This will permanently delete <strong>{stats?.disqualified || 0}</strong> disqualified leads.
                  </p>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
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
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
                className="rounded-md border border-neutral-300 px-4 py-2 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                Cancel
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Success Message */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
              <div className="flex gap-4">
                <CheckCircle className="size-6 shrink-0 text-green-600" />
                <div>
                  <h2 className="font-semibold text-green-900 dark:text-green-100">Cleanup Complete</h2>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    Deleted <strong>{deletedCount}</strong> leads. Your database is now clean.
                  </p>
                  <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                    You have <strong>{stats?.qualified || 0}</strong> qualified leads on your board ready to outreach.
                  </p>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h3 className="font-semibold">Next Steps</h3>
              <ol className="mt-3 space-y-2 text-sm">
                <li>
                  1. Visit{" "}
                  <Link href="/leads/find" className="text-blue-600 hover:underline">
                    Find Leads
                  </Link>{" "}
                  to discover HVAC companies
                </li>
                <li>
                  2. Open a qualified company and use{" "}
                  <span className="font-medium">Draft outreach email</span> on its page — it
                  writes from that company&apos;s own research, no separate tool needed
                </li>
                <li>3. Send cold emails and track responses</li>
              </ol>
            </div>

            {/* Back to Board */}
            <Link
              href="/board"
              className="block rounded-md bg-neutral-900 px-4 py-2 text-center font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Back to Board
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
