import { Router } from "express";
import { z } from "zod";
import type { PoolService } from "./pool-service.js";
import type { MembershipService } from "../memberships/membership-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MissingPerPersonAmountError,
  UnexpectedPerPersonAmountError,
} from "./types.js";
import { InvalidJoinCodeError, PoolClosedError, PoolNotFoundError } from "../memberships/types.js";

const createPoolSchema = z.object({
  name: z.string(),
  type: z.enum(["EQUAL_SPLIT", "OPEN"]),
  perPersonAmountPaise: z.number().optional(),
});

const joinByCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "code must be six digits"),
});

export function createPoolsRouter(
  poolService: PoolService,
  membershipService: MembershipService,
  jwtSecret: string,
): Router {
  const router = Router();

  router.post("/", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    const parsed = createPoolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "name and type are required" });
      return;
    }

    try {
      const pool = await poolService.createPool(req.userId as string, parsed.data);
      res.status(201).json({ pool });
    } catch (error) {
      if (
        error instanceof InvalidPoolNameError ||
        error instanceof MissingPerPersonAmountError ||
        error instanceof UnexpectedPerPersonAmountError ||
        error instanceof InvalidPerPersonAmountError
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.post(
    "/join-by-code",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = joinByCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "code is required" });
        return;
      }

      try {
        const membership = await membershipService.joinByCode(
          req.userId as string,
          parsed.data.code,
        );
        res.status(200).json({ membership });
      } catch (error) {
        if (error instanceof InvalidJoinCodeError || error instanceof PoolClosedError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:poolId/join",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const membership = await membershipService.joinByPoolId(
          req.userId as string,
          req.params.poolId,
        );
        res.status(200).json({ membership });
      } catch (error) {
        if (error instanceof PoolNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof PoolClosedError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  // Open to any authenticated user, not just Members of this Pool — no
  // per-pool authorization exists yet in v1. ADR 0008 frames ledger
  // visibility as a Member entitlement; revisit this once that's built.
  router.get("/:poolId/members", requireAuth(jwtSecret), async (req, res, next) => {
    try {
      const members = await membershipService.listMembers(req.params.poolId);
      res.status(200).json({ members });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
