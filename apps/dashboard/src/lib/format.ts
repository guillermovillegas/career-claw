/**
 * Format a number as USD currency.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) {return "--";}
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a salary range like "$80k - $120k".
 */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min == null && max == null) {return "--";}
  const fmt = (n: number) => {
    if (n >= 1000) {return `$${Math.round(n / 1000)}k`;}
    return `$${n}`;
  };
  if (min != null && max != null) {return `${fmt(min)} - ${fmt(max)}`;}
  if (min != null) {return `${fmt(min)}+`;}
  return `Up to ${fmt(max!)}`;
}

/**
 * Format a date string to a short locale date.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) {return "--";}
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a date string to a short locale date + time (e.g. "Jan 5, 2025, 3:04 PM").
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) {return "\u2014";}
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a timestamp to a relative time string (e.g. "2h ago").
 */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) {return "just now";}
  if (diffMin < 60) {return `${diffMin}m ago`;}
  if (diffHr < 24) {return `${diffHr}h ago`;}
  if (diffDay < 30) {return `${diffDay}d ago`;}
  return formatDate(dateStr);
}

/**
 * Capitalize first letter of a string and replace underscores with spaces.
 */
export function formatLabel(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
