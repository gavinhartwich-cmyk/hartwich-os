import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import PageHeader from "@/components/page-header";
import { db } from "@/db";
import { getFromEmailForAccount, type EmailAccountIndex } from "@/lib/integrations/gmail-multi";
import { getWarmupPhase, isWarmupComplete } from "@/lib/warmup/schedule";

const ACCOUNT_INDICES: EmailAccountIndex[] = [0, 1, 2];

const WARMUP_LABEL: Record<string, string> = {
  not_started: "Not started",
  warming_up: "Warming up",
  ready: "Ready",
};

/**
 * Gavin-only (see lib/auth/allowlist.ts isBookingAdmin) — connects each of
 * the 3 rotating Gmail sending accounts through this app's own OAuth flow
 * (src/app/api/auth/gmail/{authorize,callback}) instead of the old
 * OAuth-Playground-and-paste-into-Vercel workflow, which was itself the
 * cause of the recurring "token expired again" — see gmail-oauth.ts.
 */
export default async function EmailAccountsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    redirect("/board");
  }

  const params = await searchParams;

  const rows = await Promise.all(
    ACCOUNT_INDICES.map(async (accountIndex) => {
      const row = await db.query.emailSendAccounts.findFirst({
        where: (a, { eq }) => eq(a.accountIndex, accountIndex),
      });
      const warmupStatus = row?.warmupStatus ?? "not_started";
      const activeSendDays = row?.activeSendDays ?? 0;
      const { dailyLimit } = getWarmupPhase(activeSendDays);
      return {
        accountIndex,
        fromEmail: getFromEmailForAccount(accountIndex),
        connected: Boolean(row?.accessToken),
        warmupStatus,
        fullyWarm: isWarmupComplete(activeSendDays),
        activeSendDays,
        dailyLimit,
        lastSentAt: row?.lastSentAt ?? null,
      };
    })
  );

  return (
    <div>
      <PageHeader
        title="Email Accounts"
        subtitle="Connect each rotating Gmail sending account once here — this app renews the credential itself from then on, so nothing needs to be manually re-minted again."
      />

      {params.connected && (
        <p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-sm text-emerald-300">
          Account connected.
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-sm text-red-300">
          Couldn&rsquo;t connect: {params.error}
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.accountIndex} className="surface-card flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-white/90">{row.fromEmail}</p>
              <p className="text-sm text-[var(--muted)]">
                {row.connected ? (
                  <span className="text-emerald-300">Connected</span>
                ) : (
                  <span className="text-amber-300">Not connected — using legacy env var tokens, if set</span>
                )}
                {" · "}
                {WARMUP_LABEL[row.warmupStatus] ?? row.warmupStatus}
                {row.fullyWarm
                  ? " (fully warm)"
                  : ` (${row.activeSendDays}/29 days, ${row.dailyLimit}/day cap)`}
                {row.lastSentAt && ` · last sent ${row.lastSentAt.toLocaleString()}`}
              </p>
            </div>
            <a href={`/api/auth/gmail/authorize?account=${row.accountIndex}`} className="btn-secondary">
              {row.connected ? "Reconnect" : "Connect"}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
