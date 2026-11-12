const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/** When something was last edited, as the design says it: 2m ago, 1h ago, yesterday, 3d ago, last week. */
export function editedAgo(date: Date, now: Date = new Date()): string {
  const since = now.getTime() - date.getTime();
  if (since < MINUTE) {
    return "just now";
  }
  if (since < HOUR) {
    return `${Math.floor(since / MINUTE)}m ago`;
  }
  if (since < DAY) {
    return `${Math.floor(since / HOUR)}h ago`;
  }
  const days = Math.floor(since / DAY);
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 14) {
    return "last week";
  }
  return `on ${DATE.format(date)}`;
}
