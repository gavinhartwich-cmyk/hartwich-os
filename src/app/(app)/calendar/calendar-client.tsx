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
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ←
          </button>
          <span className="w-40 text-center text-sm font-medium">{monthLabel}</span>
          <button
            onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            →
          </button>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {showForm ? "Cancel" : "+ New"}
        </button>
      </div>

      {showForm && (
        <form
          action={handleCreate}
          className="mb-6 space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">What</label>
            <input
              name="description"
              required
              autoFocus
              placeholder="Call with ABC HVAC — pricing follow-up"
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">When</label>
              <input
                type="datetime-local"
                name="dueDate"
                required
                defaultValue={toLocalDatetimeInputValue(new Date())}
                className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Duration (min)</label>
              <input
                type="number"
                name="durationMinutes"
                defaultValue={30}
                min={5}
                step={5}
                className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Company (optional)</label>
              <select
                name="companyId"
                className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
              <label className="mb-1 block text-sm font-medium">Location (optional)</label>
              <input
                name="location"
                placeholder="Phone, Zoom, address..."
                className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
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
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Nothing on the calendar this month.
        </p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayTasks]) => (
            <div key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {day}
              </h2>
              <div className="space-y-2">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between rounded-md border border-neutral-200 p-3 dark:border-neutral-800 ${
                      task.completedAt ? "opacity-50" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {task.description}
                        {task.googleEventId && (
                          <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                            ✓ synced
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-500">
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
