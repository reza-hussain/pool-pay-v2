import { Router, type Response } from "express";
import type { SpendApprovalService } from "./spend-approval-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import { NotAPoolMemberError, PendingSpendNotFoundError } from "./types.js";

export function createSpendApprovalsRouter(
  spendApprovalService: SpendApprovalService,
  jwtSecret: string,
): Router {
  const router = Router();

  router.get(
    "/:poolId/pending-spends",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const pendingSpends = await spendApprovalService.listPending(
          req.params.poolId,
          req.userId as string,
        );
        res.status(200).json({ pendingSpends });
      } catch (error) {
        handleSpendApprovalError(error, res, next);
      }
    },
  );

  router.get(
    "/:poolId/pending-spends/:pendingSpendId",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const status = await spendApprovalService.getStatus(
          req.params.pendingSpendId,
          req.params.poolId,
          req.userId as string,
        );
        res.status(200).json(status);
      } catch (error) {
        handleSpendApprovalError(error, res, next);
      }
    },
  );

  router.post(
    "/:poolId/pending-spends/:pendingSpendId/approvals",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const result = await spendApprovalService.approve(
          req.params.pendingSpendId,
          req.params.poolId,
          req.userId as string,
        );
        res.status(201).json(result);
      } catch (error) {
        handleSpendApprovalError(error, res, next);
      }
    },
  );

  return router;
}

function handleSpendApprovalError(error: unknown, res: Response, next: (err: unknown) => void) {
  if (error instanceof PoolNotFoundError || error instanceof PendingSpendNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof PoolClosedError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof NotAPoolMemberError) {
    res.status(403).json({ error: error.message });
    return;
  }
  next(error);
}
