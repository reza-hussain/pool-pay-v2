import { Router } from "express";
import { z } from "zod";
import type { LedgerService } from "./ledger-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { InvalidLedgerCursorError, NotAPoolMemberError, type LedgerEntryType } from "./types.js";

const LEDGER_ENTRY_TYPES: LedgerEntryType[] = ["DEPOSIT", "SPEND", "REIMBURSEMENT", "REFUND"];

// Blank query values (?from=) should read the same as an omitted param, not
// a validation failure — normalize before the typed checks below run.
function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const ledgerQuerySchema = z.object({
  from: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  to: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  search: z.preprocess(blankToUndefined, z.string().optional()),
  counterparty: z.preprocess(blankToUndefined, z.string().optional()),
  types: z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform((raw) =>
        LEDGER_ENTRY_TYPES.filter((type) => raw.split(",").map((t) => t.trim()).includes(type)),
      )
      .optional(),
  ),
  cursor: z.preprocess(blankToUndefined, z.string().optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
});

export function createLedgerRouter(ledgerService: LedgerService, jwtSecret: string): Router {
  const router = Router();

  router.get("/:poolId/ledger", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    const parsed = ledgerQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid ledger query parameters" });
      return;
    }

    try {
      const { entries, nextCursor } = await ledgerService.getLedger(
        req.params.poolId,
        req.userId as string,
        parsed.data,
      );
      res.status(200).json({ entries, nextCursor });
    } catch (error) {
      if (error instanceof PoolNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof NotAPoolMemberError) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidLedgerCursorError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
