/** "3 days ago" / "today" / "in 2 days" — used for both a past contact date and a future due date. */
export function relativeDay(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}
