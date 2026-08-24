export type NotificationType =
  | "DEPOSIT_RECEIVED"
  | "POOL_FULLY_FUNDED"
  | "POOL_LOCKED"
  | "REFUND_PROCESSED"
  | "INVITATION_RECEIVED"
  | "INVITATION_VOIDED";

export interface Notification {
  id: string;
  recipientUserId: string;
  poolId: string;
  type: NotificationType;
  message: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationRepository {
  create(
    recipientUserId: string,
    poolId: string,
    type: NotificationType,
    message: string,
  ): Promise<Notification>;
  listByUser(userId: string): Promise<Notification[]>;
  markAllReadForUser(userId: string): Promise<void>;
}
