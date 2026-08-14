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
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Activity</h2>

      <form
        action={createActivityAction}
        className="mt-3 space-y-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
      >
        <input type="hidden" name="companyId" value={companyId} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="type" className="mb-1 block text-sm font-medium">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue="note"
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="direction" className="mb-1 block text-sm font-medium">
              Direction
            </label>
            <select
              id="direction"
              name="direction"
              defaultValue="outbound"
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          </div>
        </div>

        {contacts.length > 0 && (
          <div>
            <label htmlFor="contactId" className="mb-1 block text-sm font-medium">
              Contact
            </label>
            <select
              id="contactId"
              name="contactId"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
          <label htmlFor="bodyText" className="mb-1 block text-sm font-medium">
            Notes
          </label>
          <textarea
            id="bodyText"
            name="bodyText"
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Log activity
        </button>
      </form>

      <ul className="mt-4 space-y-3">
        {activities.length === 0 && (
          <li className="text-sm text-neutral-400">No activity logged yet.</li>
        )}
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {TYPE_LABELS[activity.type] ?? activity.type}
                <span className="ml-1 font-normal text-neutral-400">
                  · {activity.direction === "inbound" ? "Inbound" : "Outbound"}
                </span>
              </span>
              <span className="text-xs text-neutral-400">
                {new Date(activity.occurredAt).toLocaleString()}
              </span>
            </div>
            {activity.bodyText && (
              <p className="mt-1 whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">
                {activity.bodyText}
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-400">
              {activity.createdByUser?.name ?? "Unknown"}
              {activity.contact?.name ? ` · ${activity.contact.name}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
