"use client";

import { useState } from "react";
import type { Contact } from "@/lib/data/contacts";

export type OutreachResearch = {
  googleRating: string | null;
  googleReviewCount: number | null;
  isOwnerOperated: boolean | null;
  qualificationReasoning: string | null;
  websiteSummary: string | null;
  servicesOffered: string[] | null;
};

type Draft = { emailDraftId: string; subject: string; body: string };

export default function OutreachPanel({
  companyId,
  currentUserId,
  contacts,
  research,
}: {
  companyId: string;
  currentUserId: string;
  contacts: Contact[];
  research: OutreachResearch;
}) {
  const emailable = contacts.filter((c) => c.email);
  const [contactId, setContactId] = useState(emailable[0]?.id ?? "");
  const [angle, setAngle] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentAt, setSentAt] = useState<Date | null>(null);

  const hasResearch =
    research.googleRating ||
    research.googleReviewCount ||
    research.qualificationReasoning ||
    research.websiteSummary ||
    (research.servicesOffered && research.servicesOffered.length > 0);

  async function handleDraft() {
    if (!contactId) return;
    setDrafting(true);
    setError("");
    setSentAt(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, angle: angle.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to draft email");
      setDraft({ emailDraftId: data.emailDraftId, subject: data.subject, body: data.body });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!draft) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/emails/approve-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDraftId: draft.emailDraftId,
          userId: currentUserId,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason || data.error || "Failed to send email");
      setDraft(null);
      setAngle("");
      setSentAt(new Date());
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        Draft outreach email
      </h2>

      {emailable.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">
          Add a contact with an email address to draft outreach.
        </p>
      ) : (
        <div className="mt-3 space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">What the draft will use</p>
            {hasResearch ? (
              <ul className="space-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {(research.googleRating || research.googleReviewCount) && (
                  <li>
                    {research.googleRating ? `${research.googleRating}★` : "Unrated"} on Google
                    {research.googleReviewCount != null ? ` · ${research.googleReviewCount} reviews` : ""}
                  </li>
                )}
                {research.isOwnerOperated && <li>Owner-operated</li>}
                {research.servicesOffered && research.servicesOffered.length > 0 && (
                  <li>Services: {research.servicesOffered.join(", ")}</li>
                )}
                {research.websiteSummary && <li className="line-clamp-2">Website: {research.websiteSummary}</li>}
                {research.qualificationReasoning && (
                  <li className="line-clamp-2">Lead notes: {research.qualificationReasoning}</li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-neutral-400">
                No research on file yet — the draft will be more generic. Discovery-sourced leads
                pick this up automatically.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">To</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {emailable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "Unnamed contact"} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Specific angle <span className="text-neutral-400">(optional)</span>
            </label>
            <textarea
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. mention their weekend availability"
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {sentAt && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Sent at {sentAt.toLocaleTimeString()}.
            </p>
          )}

          {!draft ? (
            <button
              onClick={handleDraft}
              disabled={drafting || !contactId}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {drafting ? "Drafting…" : "Draft with AI"}
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-500">Subject</label>
                <input
                  type="text"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-500">Body</label>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={8}
                  className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDraft(null)}
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Discard
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
