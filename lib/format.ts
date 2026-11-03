export function hoursSince(d: Date | null | undefined, now = new Date()) {
  if (!d) return null;
  return (now.getTime() - d.getTime()) / 3_600_000;
}

export function formatWait(hours: number | null) {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(d: Date | null | undefined) {
  const h = hoursSince(d);
  return h == null ? "never" : `${formatWait(h)} ago`;
}
