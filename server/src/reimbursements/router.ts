import { Router } from "express";
import { z } from "zod";
import type { ReimbursementService } from "./reimbursement-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { NotPoolOrganizerError } from "../pools/types.js";
import {
  InsufficientPoolBalanceError,
  InvalidReimbursementAmountError,
  InvalidVpaError,
  RecipientNotAMemberError,
} from "./types.js";

const recordReimbursementSchema = z.object({
  memberId: z.string(),
  vpa: z.string(),
  amountPaise: z.number(),
});

export function createReimbursementsRouter(
  reimbursementService: ReimbursementService,
  jwtSecret: string,
): Router {
  const router = Router();

  router.post(
    "/:poolId/reimbursements",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = recordReimbursementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "memberId, vpa, and amountPaise are required" });
        return;
      }

      try {
        const userId = req.userId as string;
        const poolId = req.params.poolId;
        const reimbursement = await reimbursementService.recordReimbursement(
          poolId,
          userId,
          parsed.data.memberId,
          parsed.data.vpa,
          parsed.data.amountPaise,
        );
        const poolBalancePaise = await reimbursementService.getPoolBalance(poolId);
        res.status(201).json({ reimbursement, poolBalancePaise });
      } catch (error) {
        if (error instanceof PoolNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (
          error instanceof InvalidReimbursementAmountError ||
          error instanceof InvalidVpaError ||
          error instanceof RecipientNotAMemberError ||
          error instanceof InsufficientPoolBalanceError
        ) {
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
