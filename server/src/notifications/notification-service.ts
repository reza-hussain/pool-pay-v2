import type { Notification, NotificationRepository, NotificationType } from "./types.js";

export interface NotificationServiceOptions {
  notificationRepository: NotificationRepository;
}

export interface NotifyInput {
  recipientUserIds: string[];
  poolId: string;
  type: NotificationType;
  message: string;
}

export class NotificationService {
  private readonly notificationRepository: NotificationRepository;

  constructor(options: NotificationServiceOptions) {
    this.notificationRepository = options.notificationRepository;
  }

  // Recipients are resolved by the caller (DepositService, PoolService,
  // ClosureService) — each already holds the MembershipRepository/breakdown
  // needed to compute "every other current Member" or "this one recipient",
  // so NotificationService itself stays a dumb fan-out over a given list.
  async notify(input: NotifyInput): Promise<void> {
    await Promise.all(
      input.recipientUserIds.map((recipientUserId) =>
        this.notificationRepository.create(recipientUserId, input.poolId, input.type, input.message),
      ),
    );
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    const notifications = await this.notificationRepository.listByUser(userId);
    return [...notifications].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository.markAllReadForUser(userId);
  }
}
