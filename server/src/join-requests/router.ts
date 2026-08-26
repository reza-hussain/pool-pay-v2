import { Router } from "express";
import type { JoinRequestService } from "./join-request-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { NotPoolOrganizerError } from "../pools/types.js";
import { JoinRequestNotFoundError, JoinRequestNotPendingError } from "./types.js";

// Mounted at /pools — Organizer-only actions and views scoped to one Pool,
// same shape as the Invitations router.
export function createJoinRequestsRouter(joinRequestService: JoinRequestService, jwtSecret: string): Router {
  const router = Router();

  router.get(
    "/:poolId/join-requests",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const joinRequests = await joinRequestService.listPendingRequests(
          req.userId as string,
          req.params.poolId,
        );
        res.status(200).json({ joinRequests });
      } catch (error) {
        if (error instanceof PoolNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof NotPoolOrganizerError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:poolId/join-requests/:joinRequestId/approve",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const joinRequest = await joinRequestService.approve(
          req.userId as string,
          req.params.poolId,
          req.params.joinRequestId,
        );
        res.status(200).json({ joinRequest });
      } catch (error) {
        if (error instanceof PoolNotFoundError || error instanceof JoinRequestNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof JoinRequestNotPendingError) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof NotPoolOrganizerError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:poolId/join-requests/:joinRequestId/decline",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const joinRequest = await joinRequestService.decline(
          req.userId as string,
          req.params.poolId,
          req.params.joinRequestId,
        );
        res.status(200).json({ joinRequest });
      } catch (error) {
        if (error instanceof PoolNotFoundError || error instanceof JoinRequestNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof JoinRequestNotPendingError) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof NotPoolOrganizerError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
