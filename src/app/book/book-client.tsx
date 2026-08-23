"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Question = {
  id: string;
  label: string;
  fieldType: "text" | "textarea" | "email" | "phone" | "select";
  options: string[] | null;
  required: boolean;
  isCore: boolean;
};

type Config = {
  configured: boolean;
  meetingDurationMinutes: number;
  timezone: string;
  questions: Question[];
  company: { id: string; name: string } | null;
};

type AvailabilityDay = { date: string; label: string; slots: { startIso: string; label: string }[] };

type Step = "loading" | "picking" | "form" | "submitting" | "confirmed" | "unavailable" | "error";

function FieldInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
}) {
  const baseClass =
    "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900";

  if (question.fieldType === "textarea") {
    return (
      <textarea
        required={question.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className={baseClass}
      />
    );
  }

  if (question.fieldType === "select") {
    return (
      <select
        required={question.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={baseClass}
      >
        <option value="">Select…</option>
        {(question.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  const type = question.fieldType === "email" ? "email" : question.fieldType === "phone" ? "tel" : "text";
  return (
    <input
      type={type}
      required={question.required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={baseClass}
    />
  );
}

export default function BookClient() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("company") || undefined;
  const contactId = searchParams.get("contact") || undefined;
  const dealId = searchParams.get("deal") || undefined;

  const [step, setStep] = useState<Step>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const configUrl = companyId
          ? `/api/public/booking/config?company=${encodeURIComponent(companyId)}`
          : "/api/public/booking/config";
        const [configRes, availRes] = await Promise.all([
          fetch(configUrl),
          fetch("/api/public/booking/availability"),
        ]);
        const configData: Config = await configRes.json();
        const availData = await availRes.json();

        setConfig(configData);

        if (!configData.configured || !availData.configured) {
          setStep("unavailable");
          return;
        }

        setDays(availData.days || []);
        setSelectedDate(availData.days?.[0]?.date ?? null);
        setStep("picking");
      } catch {
        setStep("error");
      }
    }
    load();
  }, [companyId]);

  const selectedDay = useMemo(() => days.find((d) => d.date === selectedDate), [days, selectedDate]);

  function proceedToForm() {
    if (!selectedSlot) return;
    setStep("form");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setStep("submitting");
    setError(null);

    try {
      const res = await fetch("/api/public/booking/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStart: selectedSlot,
          answers,
          companyId,
          contactId,
          dealId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setStep("form");
        return;
      }
      setStep("confirmed");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("form");
    }
  }

  if (step === "loading") {
    return (
      <Shell companyName={config?.company?.name}>
        <p className="text-sm text-neutral-500">Loading availability…</p>
      </Shell>
    );
  }

  if (step === "unavailable") {
    return (
      <Shell companyName={config?.company?.name}>
        <p className="text-sm text-neutral-600">
          Online booking isn&apos;t available right now — reach out directly and we&apos;ll find a time.
        </p>
      </Shell>
    );
  }

  if (step === "error") {
    return (
      <Shell companyName={config?.company?.name}>
        <p className="text-sm text-red-600">Couldn&apos;t load booking availability. Please refresh and try again.</p>
      </Shell>
    );
  }

  if (step === "confirmed") {
    const confirmedLabel = selectedSlot
      ? new Date(selectedSlot).toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: config?.timezone,
          timeZoneName: "short",
        })
      : "";
    return (
      <Shell companyName={config?.company?.name}>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-emerald-700">You&apos;re booked ✓</h2>
          <p className="mt-2 text-sm text-neutral-600">{confirmedLabel}</p>
          <p className="mt-4 text-sm text-neutral-500">A confirmation email is on its way.</p>
        </div>
      </Shell>
    );
  }

  if (step === "form") {
    return (
      <Shell companyName={config?.company?.name}>
        <button onClick={() => setStep("picking")} className="mb-4 text-sm text-neutral-500 hover:text-neutral-900">
          ← Back to times
        </button>
        <p className="mb-4 text-sm font-medium text-neutral-700">
          {selectedSlot &&
            new Date(selectedSlot).toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: config?.timezone,
              timeZoneName: "short",
            })}
        </p>
        <form onSubmit={submit} className="space-y-4">
          {config?.questions.map((q) => (
            <div key={q.id}>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {q.label}
                {q.required && <span className="text-red-500"> *</span>}
              </label>
              <FieldInput
                question={q}
                value={answers[q.id] || ""}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Confirm booking
          </button>
        </form>
      </Shell>
    );
  }

  if (step === "submitting") {
    return (
      <Shell companyName={config?.company?.name}>
        <p className="text-sm text-neutral-500">Booking…</p>
      </Shell>
    );
  }

  // step === "picking"
  return (
    <Shell companyName={config?.company?.name}>
      <p className="mb-4 text-sm text-neutral-500">
        {config?.meetingDurationMinutes}-minute call · times shown in {config?.timezone}
      </p>
      {days.length === 0 ? (
        <p className="text-sm text-neutral-500">No open times right now — check back soon.</p>
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            {days.map((d) => (
              <button
                key={d.date}
                onClick={() => {
                  setSelectedDate(d.date);
                  setSelectedSlot(null);
                }}
                className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${
                  selectedDate === d.date
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {selectedDay && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {selectedDay.slots.map((s) => (
                <button
                  key={s.startIso}
                  onClick={() => setSelectedSlot(s.startIso)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    selectedSlot === s.startIso
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={proceedToForm}
            disabled={!selectedSlot}
            className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </>
      )}
    </Shell>
  );
}

function Shell({ children, companyName }: { children: React.ReactNode; companyName?: string | null }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-neutral-50 px-4 py-12 sm:items-center">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">
            {companyName ? `Book a call for ${companyName}` : "Book a call with Hartwich Labs"}
          </h1>
          <p className="text-sm text-neutral-500">Pick a time that works for you.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
