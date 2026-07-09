import { Router } from "express";
import type { LedgerService } from "./ledger-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { NotAPoolMemberError } from "./types.js";

export function createLedgerRouter(ledgerService: LedgerService, jwtSecret: string): Router {
  const router = Router();

  router.get("/:poolId/ledger", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const entries = await ledgerService.getLedger(req.params.poolId, req.userId as string);
      res.status(200).json({ entries });
    } catch (error) {
      if (error instanceof PoolNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof NotAPoolMemberError) {
        res.status(403).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
