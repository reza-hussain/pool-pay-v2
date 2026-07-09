import { Router } from "express";
import { z } from "zod";
import type { DepositService } from "./deposit-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import {
  InvalidDepositAmountError,
  NotAMemberError,
  PoolNotAcceptingDepositsError,
} from "./types.js";

const recordDepositSchema = z.object({
  amountPaise: z.number(),
});

export function createDepositsRouter(depositService: DepositService, jwtSecret: string): Router {
  const router = Router();

  router.get(
    "/:poolId/deposit-intent",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const intent = await depositService.createDepositIntent(req.params.poolId);
        res.status(200).json({ intent });
      } catch (error) {
        if (error instanceof PoolNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:poolId/deposits",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = recordDepositSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "amountPaise is required" });
        return;
      }

      try {
        const userId = req.userId as string;
        const poolId = req.params.poolId;
        const deposit = await depositService.recordDeposit(
          poolId,
          userId,
          parsed.data.amountPaise,
        );
        const [poolBalancePaise, contributionSummary] = await Promise.all([
          depositService.getPoolBalance(poolId),
          depositService.getContributionSummary(poolId, userId),
        ]);
        res.status(201).json({ deposit, poolBalancePaise, contributionSummary });
      } catch (error) {
        if (error instanceof PoolNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (
          error instanceof InvalidDepositAmountError ||
          error instanceof PoolNotAcceptingDepositsError
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof NotAMemberError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
