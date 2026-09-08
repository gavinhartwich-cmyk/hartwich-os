"use client";

import { useState } from "react";
import type { EmailThread } from "@/lib/data/email-threads";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-white/[0.06] text-white/60 ring-1 ring-inset ring-white/10",
  delivered: "bg-white/[0.06] text-white/60 ring-1 ring-inset ring-white/10",
  opened: "bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  replied: "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  bounced: "bg-red-400/10 text-red-300 ring-1 ring-inset ring-red-400/20",
  failed: "bg-red-400/10 text-red-300 ring-1 ring-inset ring-red-400/20",
  draft: "bg-white/[0.04] text-white/40 ring-1 ring-inset ring-white/10",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  replied: "Replied",
  bounced: "Bounced",
  failed: "Failed",
  draft: "Draft",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.sent}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ThreadCard({
  companyId,
  currentUserId,
  thread,
}: {
  companyId: string;
  currentUserId: string;
  thread: EmailThread;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState(thread.messages);

  async function handleReply() {
    if (!replyBody.trim() || !thread.replyTarget) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/companies/${companyId}/emails/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thread.contactId,
          body: replyBody.trim(),
          userId: currentUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reply");
      setMessages((prev) => [
        ...prev,
        {
          id: data.activityId,
          direction: "outbound",
          status: "sent",
          subject: data.subject,
          bodyText: replyBody.trim(),
          occurredAt: new Date(data.sentAt),
          openedAt: null,
          bouncedAt: null,
          bounceReason: null,
        },
      ]);
      setReplyBody("");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="surface-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-white/85">
          {thread.contactName || "Unnamed contact"}
        </p>
        <p className="text-xs text-[var(--muted-2)]">{thread.contactEmail}</p>
      </div>

      <ul className="mt-3 space-y-2">
        {messages.map((message) => (
          <li
            key={message.id}
            className={
              message.direction === "inbound"
                ? "rounded-md border border-emerald-400/15 bg-emerald-400/[0.04] p-2.5"
                : "rounded-md border border-white/10 bg-white/[0.02] p-2.5"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-white/70">
                {message.direction === "inbound"
                  ? `↩ ${thread.contactName || "Reply"}`
                  : "You"}
                {message.subject && (
                  <span className="ml-1.5 font-normal text-[var(--muted-2)]">
                    — {message.subject}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                {message.direction === "outbound" && <StatusPill status={message.status} />}
                <span className="text-[11px] text-[var(--muted-2)]">
                  {new Date(message.occurredAt).toLocaleString()}
                </span>
              </div>
            </div>
            {message.status === "bounced" && message.bounceReason && (
              <p className="mt-1 text-xs text-red-300/80">{message.bounceReason}</p>
            )}
            {message.bodyText && (
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-white/60">
                {message.bodyText}
              </p>
            )}
          </li>
        ))}
      </ul>

      {thread.replyTarget ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            className="input-field"
            disabled={sending}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleReply}
            disabled={sending || !replyBody.trim()}
            className="btn-primary text-xs"
          >
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted-2)]">
          No sendable thread yet — reply once an outreach email has gone out.
        </p>
      )}
    </div>
  );
}

export default function EmailStatusPanel({
  companyId,
  currentUserId,
  threads,
}: {
  companyId: string;
  currentUserId: string;
  threads: EmailThread[];
}) {
  if (threads.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-white/80">Email status</h2>
      <div className="mt-3 space-y-4">
        {threads.map((thread) => (
          <ThreadCard
            key={thread.contactId}
            companyId={companyId}
            currentUserId={currentUserId}
            thread={thread}
          />
        ))}
      </div>
    </section>
  );
}
