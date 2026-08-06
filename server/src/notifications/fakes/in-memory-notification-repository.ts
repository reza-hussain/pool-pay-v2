import type { Notification, NotificationRepository, NotificationType } from "../types.js";

let nextId = 1;

export class InMemoryNotificationRepository implements NotificationRepository {
  notifications: Notification[] = [];

  async create(
    recipientUserId: string,
    poolId: string,
    type: NotificationType,
    message: string,
  ): Promise<Notification> {
    const notification: Notification = {
      id: `notification_${nextId++}`,
      recipientUserId,
      poolId,
      type,
      message,
      createdAt: new Date(),
      readAt: null,
    };
    this.notifications.push(notification);
    return notification;
  }

  async listByUser(userId: string): Promise<Notification[]> {
    return this.notifications.filter((n) => n.recipientUserId === userId);
  }

  async markAllReadForUser(userId: string): Promise<void> {
    const now = new Date();
    for (const notification of this.notifications) {
      if (notification.recipientUserId === userId && !notification.readAt) {
        notification.readAt = now;
      }
    }
  }
}
