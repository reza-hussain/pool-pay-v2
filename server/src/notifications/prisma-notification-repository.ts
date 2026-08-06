import type { PrismaClient } from "@prisma/client";
import type { Notification, NotificationRepository, NotificationType } from "./types.js";

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    recipientUserId: string,
    poolId: string,
    type: NotificationType,
    message: string,
  ): Promise<Notification> {
    const row = await this.prisma.notification.create({
      data: { recipientUserId, poolId, type, message },
    });
    return toNotification(row);
  }

  async listByUser(userId: string): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({ where: { recipientUserId: userId } });
    return rows.map(toNotification);
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

function toNotification(row: {
  id: string;
  recipientUserId: string;
  poolId: string;
  type: string;
  message: string;
  createdAt: Date;
  readAt: Date | null;
}): Notification {
  return { ...row, type: row.type as NotificationType };
}
