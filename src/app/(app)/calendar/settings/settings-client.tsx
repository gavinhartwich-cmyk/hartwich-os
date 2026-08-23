"use client";

import { useEffect, useState } from "react";

type Settings = {
  id: string;
  bookingWindowDays: number;
  meetingDurationMinutes: number;
  minNoticeHours: number;
  timezone: string;
  workingDays: number[];
  workingHoursStart: string;
  workingHoursEnd: string;
};

type Question = {
  id: string;
  label: string;
  fieldType: "text" | "textarea" | "email" | "phone" | "select";
  options: string[] | null;
  required: boolean;
  isCore: boolean;
  position: number;
};

type Booking = {
  id: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: "confirmed" | "cancelled";
  company: { id: string; name: string } | null;
  answers: Record<string, string>;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default function BookingSettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [bookingUrl, setBookingUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ label: "", fieldType: "text" as Question["fieldType"] });

  async function loadAll() {
    setLoading(true);
    try {
      const [settingsRes, questionsRes, bookingsRes] = await Promise.all([
        fetch("/api/booking/settings"),
        fetch("/api/booking/questions"),
        fetch("/api/booking/list"),
      ]);
      const settingsData = await settingsRes.json();
      const questionsData = await questionsRes.json();
      const bookingsData = await bookingsRes.json();
      setSettings(settingsData.settings);
      setQuestions(questionsData.questions);
      setBookings(bookingsData.bookings);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    setBookingUrl(`${window.location.origin}/book`);
  }, []);

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings) return;
    setSavingSettings(true);
    const merged = { ...settings, ...patch };
    setSettings(merged);
    try {
      const res = await fetch("/api/booking/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } finally {
      setSavingSettings(false);
    }
  }

  function toggleWorkingDay(day: number) {
    if (!settings) return;
    const has = settings.workingDays.includes(day);
    const next = has ? settings.workingDays.filter((d) => d !== day) : [...settings.workingDays, day].sort();
    saveSettings({ workingDays: next });
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.label.trim()) return;
    const res = await fetch("/api/booking/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newQuestion.label.trim(), fieldType: newQuestion.fieldType, required: false }),
    });
    if (res.ok) {
      setNewQuestion({ label: "", fieldType: "text" });
      await loadAll();
    }
  }

  async function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    await fetch(`/api/booking/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Remove this question from the booking form?")) return;
    const res = await fetch(`/api/booking/questions/${id}`, { method: "DELETE" });
    if (res.ok) setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function moveQuestion(index: number, direction: -1 | 1) {
    const next = [...questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
    await fetch("/api/booking/questions/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((q) => q.id) }),
    });
  }

  async function cancelBooking(id: string) {
    if (!confirm("Cancel this booking? This removes it from Google Calendar too.")) return;
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    await fetch(`/api/booking/${id}/cancel`, { method: "POST" });
  }

  function copyLink() {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading || !settings) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.scheduledAt) > new Date());

  return (
    <div className="space-y-8">
      {/* Booking link */}
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-semibold">Your booking link</h2>
        <div className="flex items-center gap-2">
          <input readOnly value={bookingUrl} className={inputClass} />
          <button
            onClick={copyLink}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Send this to a prospect, or add <code>?company=&lt;id&gt;</code> from a company page to link the booking
          back to that CRM record.
        </p>
      </section>

      {/* Availability rules */}
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">Availability</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">How far out can they book</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={180}
                defaultValue={settings.bookingWindowDays}
                onBlur={(e) => saveSettings({ bookingWindowDays: Number(e.target.value) })}
                className={inputClass}
              />
              <span className="text-xs text-neutral-500">days</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Meeting length</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                defaultValue={settings.meetingDurationMinutes}
                onBlur={(e) => saveSettings({ meetingDurationMinutes: Number(e.target.value) })}
                className={inputClass}
              />
              <span className="text-xs text-neutral-500">min</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Minimum notice</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={168}
                defaultValue={settings.minNoticeHours}
                onBlur={(e) => saveSettings({ minNoticeHours: Number(e.target.value) })}
                className={inputClass}
              />
              <span className="text-xs text-neutral-500">hrs</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Working days</label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={day}
                onClick={() => toggleWorkingDay(day)}
                className={`h-8 w-10 rounded-md border text-xs font-medium ${
                  settings.workingDays.includes(day)
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:w-64">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">From</label>
            <input
              type="time"
              defaultValue={settings.workingHoursStart}
              onBlur={(e) => saveSettings({ workingHoursStart: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">To</label>
            <input
              type="time"
              defaultValue={settings.workingHoursEnd}
              onBlur={(e) => saveSettings({ workingHoursEnd: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Timezone</label>
          <input
            defaultValue={settings.timezone}
            onBlur={(e) => saveSettings({ timezone: e.target.value })}
            className={`${inputClass} sm:w-64`}
          />
        </div>
        {savingSettings && <p className="mt-2 text-xs text-neutral-400">Saving…</p>}
      </section>

      {/* Questionnaire */}
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">Questionnaire</h2>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => moveQuestion(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveQuestion(i, 1)}
                  disabled={i === questions.length - 1}
                  className="text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-20"
                >
                  ▼
                </button>
              </div>
              <input
                defaultValue={q.label}
                onBlur={(e) => e.target.value !== q.label && updateQuestion(q.id, { label: e.target.value })}
                className={`${inputClass} flex-1`}
              />
              <span className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800">
                {q.fieldType}
              </span>
              <label className="flex items-center gap-1 text-xs text-neutral-500">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                />
                Required
              </label>
              {q.isCore ? (
                <span className="text-xs text-neutral-400">core field</span>
              ) : (
                <button onClick={() => deleteQuestion(q.id)} className="text-xs text-red-600 hover:text-red-800">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={addQuestion} className="mt-4 flex gap-2">
          <input
            placeholder="New question…"
            value={newQuestion.label}
            onChange={(e) => setNewQuestion((s) => ({ ...s, label: e.target.value }))}
            className={inputClass}
          />
          <select
            value={newQuestion.fieldType}
            onChange={(e) => setNewQuestion((s) => ({ ...s, fieldType: e.target.value as Question["fieldType"] }))}
            className={`${inputClass} w-32 shrink-0`}
          >
            <option value="text">Text</option>
            <option value="textarea">Paragraph</option>
            <option value="select">Dropdown</option>
          </select>
          <button
            type="submit"
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
          >
            Add
          </button>
        </form>
      </section>

      {/* Upcoming bookings */}
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">Upcoming bookings ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing booked yet.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div>
                  <p className="text-sm font-medium">
                    {b.prospectName}
                    {b.company && ` · ${b.company.name}`}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(b.scheduledAt).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    · {b.durationMinutes}m · {b.prospectEmail}
                    {b.prospectPhone && ` · ${b.prospectPhone}`}
                  </p>
                </div>
                <button
                  onClick={() => cancelBooking(b.id)}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
