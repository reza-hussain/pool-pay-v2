import { Router } from "express";
import type { LedgerService } from "./ledger-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { NotAPoolMemberError, type LedgerEntryType, type LedgerQuery } from "./types.js";

const VALID_ENTRY_TYPES: readonly LedgerEntryType[] = ["DEPOSIT", "SPEND", "REIMBURSEMENT", "REFUND"];

function isLedgerEntryType(value: string): value is LedgerEntryType {
  return (VALID_ENTRY_TYPES as readonly string[]).includes(value);
}

function parseLedgerQuery(req: AuthenticatedRequest): LedgerQuery {
  const query: LedgerQuery = {};
  const { from, to, search, counterparty, types, cursor, limit } = req.query;

  if (typeof from === "string" && from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) {
      query.from = parsed;
    }
  }

  if (typeof to === "string" && to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) {
      query.to = parsed;
    }
  }

  if (typeof search === "string" && search.trim()) {
    query.search = search.trim();
  }

  if (typeof counterparty === "string" && counterparty) {
    query.counterparty = counterparty;
  }

  if (typeof types === "string" && types) {
    const parsedTypes = types
      .split(",")
      .map((type) => type.trim().toUpperCase())
      .filter(isLedgerEntryType);
    if (parsedTypes.length > 0) {
      query.types = parsedTypes;
    }
  }

  if (typeof cursor === "string" && cursor) {
    query.cursor = cursor;
  }

  if (typeof limit === "string" && limit) {
    const parsedLimit = Number.parseInt(limit, 10);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      query.limit = parsedLimit;
    }
  }

  return query;
}

export function createLedgerRouter(ledgerService: LedgerService, jwtSecret: string): Router {
  const router = Router();

  router.get("/:poolId/ledger", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { entries, nextCursor } = await ledgerService.getLedger(
        req.params.poolId,
        req.userId as string,
        parseLedgerQuery(req),
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
      next(error);
    }
  });

  return router;
}
