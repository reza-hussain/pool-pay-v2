import { Router } from "express";
import type { NotificationService } from "./notification-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";

export function createNotificationsRouter(
  notificationService: NotificationService,
  jwtSecret: string,
): Router {
  const router = Router();

  router.get("/", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const notifications = await notificationService.listNotifications(req.userId as string);
      res.status(200).json({ notifications });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/mark-all-read",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        await notificationService.markAllRead(req.userId as string);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
