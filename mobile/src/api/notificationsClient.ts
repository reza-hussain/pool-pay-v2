const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class NotificationsApiError extends Error {}

export type NotificationType =
  | "DEPOSIT_RECEIVED"
  | "POOL_FULLY_FUNDED"
  | "POOL_LOCKED"
  | "REFUND_PROCESSED"
  | "INVITATION_RECEIVED";

export interface Notification {
  id: string;
  poolId: string;
  type: NotificationType;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export async function getNotifications(token: string): Promise<Notification[]> {
  const res = await fetch(`${API_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new NotificationsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.notifications as Notification[];
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/notifications/mark-all-read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new NotificationsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
}
