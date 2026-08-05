// Money stays paise everywhere else on the server (every amountPaise field,
// every API response) — this one spot formats it into rupees because
// Notification.message (see notifications/types.ts) is human-readable prose
// with nowhere else to carry the figure, unlike Activity's structured
// ActivityEntry which keeps amountPaise separate for the client to format.
export function formatRupees(amountPaise: number): string {
  return `₹${(amountPaise / 100).toLocaleString("en-IN")}`;
}
