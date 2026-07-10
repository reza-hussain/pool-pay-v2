import { Router } from "express";
import type { AnalyticsService } from "./analytics-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { NotSubscribedError } from "./types.js";

export function createAnalyticsRouter(analyticsService: AnalyticsService, jwtSecret: string): Router {
  const router = Router();

  router.get(
    "/cross-pool",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const analytics = await analyticsService.getCrossPoolAnalytics(req.userId as string);
        res.status(200).json(analytics);
      } catch (error) {
        if (error instanceof NotSubscribedError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
