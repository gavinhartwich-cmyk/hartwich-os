import type { CompanyActivity } from "@/lib/data/activities";
import type { Contact } from "@/lib/data/contacts";
import { createActivityAction } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  sms: "SMS",
  linkedin: "LinkedIn",
};

export default function ActivityPanel({
  companyId,
  activities,
  contacts,
}: {
  companyId: string;
  activities: CompanyActivity[];
  contacts: Contact[];
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-white/80">Activity</h2>

      <form
        action={createActivityAction}
        className="mt-3 space-y-3 surface-card p-3"
      >
        <input type="hidden" name="companyId" value={companyId} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="type" className="mb-1 block text-sm font-medium text-[var(--muted)]">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue="note"
              className="input-field"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="direction" className="mb-1 block text-sm font-medium text-[var(--muted)]">
              Direction
            </label>
            <select
              id="direction"
              name="direction"
              defaultValue="outbound"
              className="input-field"
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          </div>
        </div>

        {contacts.length > 0 && (
          <div>
            <label htmlFor="contactId" className="mb-1 block text-sm font-medium text-[var(--muted)]">
              Contact
            </label>
            <select
              id="contactId"
              name="contactId"
              defaultValue=""
              className="input-field"
            >
              <option value="">No contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name || "Unnamed contact"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="bodyText" className="mb-1 block text-sm font-medium text-[var(--muted)]">
            Notes
          </label>
          <textarea
            id="bodyText"
            name="bodyText"
            rows={3}
            className="input-field"
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
        >
          Log activity
        </button>
      </form>

      <ul className="mt-4 space-y-3">
        {activities.length === 0 && (
          <li className="text-sm text-[var(--muted-2)]">No activity logged yet.</li>
        )}
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="surface-card p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {TYPE_LABELS[activity.type] ?? activity.type}
                <span className="ml-1 font-normal text-[var(--muted-2)]">
                  · {activity.direction === "inbound" ? "Inbound" : "Outbound"}
                </span>
              </span>
              <span className="text-xs text-[var(--muted-2)]">
                {new Date(activity.occurredAt).toLocaleString()}
              </span>
            </div>
            {activity.bodyText && (
              <p className="mt-1 whitespace-pre-wrap text-white/70">
                {activity.bodyText}
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--muted-2)]">
              {activity.createdByUser?.name ?? "Unknown"}
              {activity.contact?.name ? ` · ${activity.contact.name}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
