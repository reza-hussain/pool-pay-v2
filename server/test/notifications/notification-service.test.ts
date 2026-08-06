import { describe, expect, it } from "vitest";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";

const POOL_ID = "pool_1";
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";

function makeService() {
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });
  return { notificationService, notificationRepository };
}

describe("NotificationService", () => {
  describe("notify", () => {
    it("creates one notification row per recipient", async () => {
      const { notificationService, notificationRepository } = makeService();

      await notificationService.notify({
        recipientUserIds: [MEMBER_A, MEMBER_B],
        poolId: POOL_ID,
        type: "POOL_LOCKED",
        message: "Goa Trip was locked",
      });

      const forA = await notificationRepository.listByUser(MEMBER_A);
      const forB = await notificationRepository.listByUser(MEMBER_B);
      expect(forA).toHaveLength(1);
      expect(forB).toHaveLength(1);
      expect(forA[0]).toMatchObject({
        recipientUserId: MEMBER_A,
        poolId: POOL_ID,
        type: "POOL_LOCKED",
        message: "Goa Trip was locked",
        readAt: null,
      });
    });

    it("creates no rows when the recipient list is empty", async () => {
      const { notificationService, notificationRepository } = makeService();

      await notificationService.notify({
        recipientUserIds: [],
        poolId: POOL_ID,
        type: "POOL_LOCKED",
        message: "Goa Trip was locked",
      });

      expect(await notificationRepository.listByUser(MEMBER_A)).toHaveLength(0);
    });
  });

  describe("listNotifications", () => {
    it("returns only the given user's notifications, newest first", async () => {
      const { notificationService } = makeService();

      await notificationService.notify({
        recipientUserIds: [MEMBER_A],
        poolId: POOL_ID,
        type: "DEPOSIT_RECEIVED",
        message: "first",
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await notificationService.notify({
        recipientUserIds: [MEMBER_A],
        poolId: POOL_ID,
        type: "DEPOSIT_RECEIVED",
        message: "second",
      });
      await notificationService.notify({
        recipientUserIds: [MEMBER_B],
        poolId: POOL_ID,
        type: "DEPOSIT_RECEIVED",
        message: "for someone else",
      });

      const list = await notificationService.listNotifications(MEMBER_A);
      expect(list.map((n) => n.message)).toEqual(["second", "first"]);
    });
  });

  describe("markAllRead", () => {
    it("marks every unread notification for that user as read, leaving others alone", async () => {
      const { notificationService } = makeService();

      await notificationService.notify({
        recipientUserIds: [MEMBER_A, MEMBER_B],
        poolId: POOL_ID,
        type: "POOL_LOCKED",
        message: "Goa Trip was locked",
      });

      await notificationService.markAllRead(MEMBER_A);

      const [forA] = await notificationService.listNotifications(MEMBER_A);
      const [forB] = await notificationService.listNotifications(MEMBER_B);
      expect(forA.readAt).not.toBeNull();
      expect(forB.readAt).toBeNull();
    });

    it("is a no-op when there's nothing to mark read", async () => {
      const { notificationService } = makeService();
      await expect(notificationService.markAllRead(MEMBER_A)).resolves.toBeUndefined();
    });
  });
});
