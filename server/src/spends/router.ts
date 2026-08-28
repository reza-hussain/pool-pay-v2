import { Router } from "express";
import { z } from "zod";
import type { SpendService } from "./spend-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import {
  InvalidMerchantReferenceError,
  InvalidSpendAmountError,
  NotAPoolMemberError,
  SpendUnaffordableByAnyMemberError,
} from "./types.js";

const recordSpendSchema = z.object({
  merchantRef: z.string(),
  amountPaise: z.number(),
});

export function createSpendsRouter(spendService: SpendService, jwtSecret: string): Router {
  const router = Router();

  router.post(
    "/:poolId/spends",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = recordSpendSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "merchantRef and amountPaise are required" });
        return;
      }

      try {
        const userId = req.userId as string;
        const poolId = req.params.poolId;
        const result = await spendService.recordSpend(
          poolId,
          userId,
          parsed.data.merchantRef,
          parsed.data.amountPaise,
        );
        const poolBalancePaise = await spendService.getPoolBalance(poolId);
        if (result.spend) {
          res.status(201).json({ spend: result.spend, poolBalancePaise });
          return;
        }
        // Held for majority approval (ADR-0020) — no money has moved yet.
        res.status(202).json({ pendingSpend: result.pendingSpend, poolBalancePaise });
      } catch (error) {
        if (error instanceof PoolNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (
          error instanceof InvalidSpendAmountError ||
          error instanceof InvalidMerchantReferenceError ||
          error instanceof SpendUnaffordableByAnyMemberError ||
          error instanceof PoolClosedError
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof NotAPoolMemberError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
