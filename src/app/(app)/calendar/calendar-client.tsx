"use client";

import { useEffect, useState, useCallback } from "react";

type Task = {
  id: string;
  description: string;
  dueDate: string;
  durationMinutes: number;
  location: string | null;
  completedAt: string | null;
  googleEventId: string | null;
  company: { id: string; name: string } | null;
};

function startOfMonth(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function endOfMonth(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 1); // exclusive
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const d = startOfMonth(monthKey);
  d.setMonth(d.getMonth() + delta);
  return monthKeyOf(d);
}

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CalendarClient({
  companies,
}: {
  companies: { id: string; name: string }[];
}) {
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarSynced, setCalendarSynced] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = startOfMonth(monthKey).toISOString();
      const to = endOfMonth(monthKey).toISOString();
      const res = await fetch(`/api/tasks?from=${from}&to=${to}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(formData: FormData) {
    setSaving(true);
    try {
      const dueDateLocal = formData.get("dueDate") as string;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: formData.get("description"),
          dueDate: new Date(dueDateLocal).toISOString(),
          durationMinutes: Number(formData.get("durationMinutes") || 30),
          location: formData.get("location") || undefined,
          companyId: formData.get("companyId") || undefined,
          syncToCalendar: formData.get("syncToCalendar") === "on",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completedAt: new Date().toISOString() } : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this item? This also removes it from Google Calendar if synced.")) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  const grouped = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const day = new Date(task.dueDate).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    (acc[day] ??= []).push(task);
    return acc;
  }, {});

  const monthLabel = startOfMonth(monthKey).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthKey((m) => shiftMonth(m, -1))}
            className="btn-secondary px-2 py-1"
          >
            ←
          </button>
          <span className="w-40 text-center text-sm font-medium">{monthLabel}</span>
          <button
            onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
            className="btn-secondary px-2 py-1"
          >
            →
          </button>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="btn-primary"
        >
          {showForm ? "Cancel" : "+ New"}
        </button>
      </div>

      {showForm && (
        <form
          action={handleCreate}
          className="mb-6 space-y-3 surface-card p-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--muted)]">What</label>
            <input
              name="description"
              required
              autoFocus
              placeholder="Call with ABC HVAC — pricing follow-up"
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">When</label>
              <input
                type="datetime-local"
                name="dueDate"
                required
                defaultValue={toLocalDatetimeInputValue(new Date())}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Duration (min)</label>
              <input
                type="number"
                name="durationMinutes"
                defaultValue={30}
                min={5}
                step={5}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Company (optional)</label>
              <select
                name="companyId"
                className="input-field"
              >
                <option value="">—</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Location (optional)</label>
              <input
                name="location"
                placeholder="Phone, Zoom, address..."
                className="input-field"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              name="syncToCalendar"
              defaultChecked={calendarSynced}
              onChange={(e) => setCalendarSynced(e.target.checked)}
            />
            Sync to Google Calendar
          </label>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="surface-card border-dashed p-6 text-sm text-[var(--muted)]">
          Nothing on the calendar this month.
        </p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayTasks]) => (
            <div key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {day}
              </h2>
              <div className="space-y-2">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between surface-card p-3 ${
                      task.completedAt ? "opacity-50" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {task.description}
                        {task.googleEventId && (
                          <span className="ml-2 text-xs font-normal text-emerald-400">
                            ✓ synced
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--muted-2)]">
                        {new Date(task.dueDate).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        · {task.durationMinutes}m
                        {task.company && ` · ${task.company.name}`}
                        {task.location && ` · ${task.location}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!task.completedAt && (
                        <button
                          onClick={() => handleComplete(task.id)}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Done
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
