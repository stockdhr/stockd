export function addCalendarMonths(input: Date, months: number): Date {
  const date = new Date(input);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date;
}

export function subscriptionState(user: { role: string; account_status: string; subscription_expires_at: string | null }, now = new Date()): "active" | "expiring_soon" | "expired" | "disabled" {
  if (user.role === "admin") return "active";
  if (user.account_status === "disabled") return "disabled";
  if (!user.subscription_expires_at) return "expired";
  const expires = new Date(user.subscription_expires_at);
  if (expires <= now) return "expired";
  if (expires.getTime() - now.getTime() <= 7 * 86_400_000) return "expiring_soon";
  return "active";
}

