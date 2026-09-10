"use client";

import { useState, useTransition } from "react";
import { sendChatMessage, confirmGoalProposal } from "@/lib/actions/ai-workforce-chat";
import type { ChatMessage } from "@/lib/data/ai-workforce-chat";

export default function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    startTransition(async () => {
      await sendChatMessage(text);
    });
  }

  function handleConfirm(messageId: string) {
    startTransition(async () => {
      await confirmGoalProposal(messageId);
    });
  }

  return (
    <div className="surface-card flex h-[70vh] flex-col p-4">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Say hello, ask how things are going, or set a goal — e.g. &quot;get us 10 new clients this
            month.&quot;
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-left text-sm ${
                m.role === "user" ? "bg-white text-black" : "bg-white/[0.06] text-white/90"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.proposedGoal && (
                <div className="mt-2 border-t border-black/10 pt-2">
                  <p className="text-xs opacity-70">
                    Proposed: {m.proposedGoal.target} {m.proposedGoal.metric} within {m.proposedGoal.periodDays}{" "}
                    days, priority {m.proposedGoal.priority}
                  </p>
                  <p className="text-xs opacity-70">{m.proposedGoal.rationale}</p>
                  {m.confirmedAt ? (
                    <p className="mt-1 text-xs font-medium text-emerald-400">Confirmed — goal created</p>
                  ) : (
                    <button
                      onClick={() => handleConfirm(m.id)}
                      disabled={pending}
                      className="mt-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Confirm goal
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && <p className="text-xs text-[var(--muted)]">Thinking…</p>}
      </div>

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to the Sales Manager…"
          className="input-field flex-1"
          disabled={pending}
        />
        <button type="submit" disabled={pending || !input.trim()} className="btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
