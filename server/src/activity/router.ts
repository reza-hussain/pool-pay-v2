import { Router } from "express";
import type { ActivityService } from "./activity-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";

export function createActivityRouter(activityService: ActivityService, jwtSecret: string): Router {
  const router = Router();

  router.get("/", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const entries = await activityService.getActivity(req.userId as string);
      res.status(200).json({ entries });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
