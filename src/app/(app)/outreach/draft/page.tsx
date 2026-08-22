"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DraftedEmail {
  subject: string;
  body: string;
  aiRunId: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  companyId: string;
  company: { name: string };
}

export default function OutreachDraftPage() {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "instruct" | "draft" | "sending">("select");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<DraftedEmail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Fetch contacts on mount
  const loadContacts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to load contacts");
      const data = await res.json();
      setContacts(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // Generate AI draft via API
  const handleDraft = async () => {
    if (!selectedContact || !instruction.trim()) {
      setError("Select a contact and enter your instruction");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/outreach/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: selectedContact.company.name,
          contactName: selectedContact.name,
          instruction: instruction.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate draft");
      }

      const draftResult = await res.json();
      setDraft(draftResult);
      setStep("draft");
    } catch (err) {
      setError(`Failed to generate draft: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Send email
  const handleSend = async () => {
    if (!draft || !selectedContact) return;

    try {
      setLoading(true);
      setStep("sending");
      setError("");

      const res = await fetch("/api/outreach/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedContact.id,
          subject: draft.subject,
          body: draft.body,
          aiRunId: draft.aiRunId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send email");
      }

      // Success
      setStep("select");
      setSelectedContact(null);
      setInstruction("");
      setDraft(null);
      router.push("/companies/" + selectedContact.companyId);
    } catch (err) {
      setError(String(err));
      setStep("draft");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Draft Outreach Email</h1>

        {error && (
          <div className="rounded bg-red-500/20 p-3 text-red-300">
            {error}
          </div>
        )}

        {/* Step 1: Select Contact */}
        {step === "select" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select a contact to email:
            </p>
            {contacts.length === 0 && (
              <button
                onClick={loadContacts}
                disabled={loading}
                className="w-full rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load Contacts"}
              </button>
            )}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedContact(c);
                    setStep("instruct");
                  }}
                  className="block w-full rounded border border-border bg-card p-3 text-left hover:bg-card/80"
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-muted-foreground">{c.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.company.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Enter Instruction */}
        {step === "instruct" && selectedContact && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">To:</p>
              <p className="text-foreground">{selectedContact.name}</p>
              <p className="text-sm text-muted-foreground">{selectedContact.company.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                What do you want to say?
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="E.g., 'Ask about their negative reviews and offer to help improve customer satisfaction'"
                className="w-full rounded border border-border bg-card p-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                rows={4}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("select")}
                className="flex-1 rounded border border-border px-4 py-2 text-foreground hover:bg-card"
              >
                Back
              </button>
              <button
                onClick={handleDraft}
                disabled={!instruction.trim() || loading}
                className="flex-1 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                {loading ? "Generating..." : "Draft with AI"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Send Draft */}
        {step === "draft" && draft && selectedContact && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">TO</p>
                <p className="text-foreground">{selectedContact.email}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground">SUBJECT</p>
                <input
                  type="text"
                  value={draft.subject}
                  onChange={(e) =>
                    setDraft({ ...draft, subject: e.target.value })
                  }
                  className="w-full rounded border border-border bg-background px-2 py-1 text-foreground"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground">BODY</p>
                <textarea
                  value={draft.body}
                  onChange={(e) =>
                    setDraft({ ...draft, body: e.target.value })
                  }
                  className="w-full rounded border border-border bg-background px-2 py-1 text-foreground font-mono text-sm"
                  rows={8}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                AI generated • {draft.body.split(" ").length} words
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("instruct")}
                className="flex-1 rounded border border-border px-4 py-2 text-foreground hover:bg-card"
              >
                Back
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="flex-1 rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        )}

        {step === "sending" && (
          <div className="text-center py-8">
            <div className="mb-4 inline-block animate-spin">⏳</div>
            <p className="text-muted-foreground">Sending email...</p>
          </div>
        )}
      </div>
    </main>
  );
}
