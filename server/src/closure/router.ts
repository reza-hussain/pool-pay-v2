import { Router, type Response } from "express";
import type { ClosureService } from "./closure-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { NotPoolOrganizerError } from "../pools/types.js";
import { PoolAlreadyClosedError } from "./types.js";

export function createClosureRouter(closureService: ClosureService, jwtSecret: string): Router {
  const router = Router();

  router.get(
    "/:poolId/close/preview",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const preview = await closureService.previewClosure(req.params.poolId, req.userId as string);
        res.status(200).json(preview);
      } catch (error) {
        handleClosureError(error, res, next);
      }
    },
  );

  router.post(
    "/:poolId/close",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const result = await closureService.closePool(req.params.poolId, req.userId as string);
        res.status(200).json(result);
      } catch (error) {
        handleClosureError(error, res, next);
      }
    },
  );

  return router;
}

function handleClosureError(error: unknown, res: Response, next: (err: unknown) => void) {
  if (error instanceof PoolNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof PoolAlreadyClosedError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof NotPoolOrganizerError) {
    res.status(403).json({ error: error.message });
    return;
  }
  next(error);
}
