import { Router, type Response } from "express";
import { z } from "zod";
import type { PoolService } from "./pool-service.js";
import type { MembershipService } from "../memberships/membership-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import {
  InvalidOrganizerShareAmountError,
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MaxActivePoolsExceededError,
  MissingOrganizerShareAmountError,
  MissingPerPersonAmountError,
  NotPoolOrganizerError,
  OrganizerNotVerifiedError,
  UnexpectedOrganizerShareAmountError,
  UnexpectedPerPersonAmountError,
} from "./types.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolAwaitingPaymentError,
  PoolClosedError,
  PoolNotFoundError,
  TargetAlreadyOrganizerError,
} from "../memberships/types.js";
import { MemberHasNoRegisteredUpiIdError } from "../reimbursements/types.js";

const createPoolSchema = z.object({
  name: z.string(),
  type: z.enum(["EQUAL_SPLIT", "OPEN", "CUSTOM_SPLIT"]),
  perPersonAmountPaise: z.number().optional(),
  organizerShareAmountPaise: z.number().optional(),
});

const joinByCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "code must be six digits"),
});

// Organizer review-and-adjust step (ADR-0022): omit to pay the computed
// default, or supply the Organizer's manually adjusted refund amount.
const removeMemberSchema = z.object({
  adjustedAmountPaise: z.number().int().min(0).optional(),
});

const transferOrganizerSchema = z.object({
  newOrganizerUserId: z.string(),
});

export function createPoolsRouter(
  poolService: PoolService,
  membershipService: MembershipService,
  jwtSecret: string,
): Router {
  const router = Router();

  router.get("/", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pools = await poolService.listPoolsForUser(req.userId as string);
      res.status(200).json({ pools });
    } catch (error) {
      next(error);
    }
  });

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
        error instanceof InvalidPerPersonAmountError ||
        error instanceof MissingOrganizerShareAmountError ||
        error instanceof UnexpectedOrganizerShareAmountError ||
        error instanceof InvalidOrganizerShareAmountError
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof OrganizerNotVerifiedError) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (error instanceof MaxActivePoolsExceededError) {
        res.status(403).json({ error: error.message });
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
        if (
          error instanceof InvalidJoinCodeError ||
          error instanceof PoolClosedError ||
          error instanceof PoolAwaitingPaymentError
        ) {
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
        if (error instanceof PoolClosedError || error instanceof PoolAwaitingPaymentError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:poolId/lock",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const pool = await poolService.lockPool(req.params.poolId, req.userId as string);
        res.status(200).json({ pool });
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

  // Organizer review-and-adjust step (ADR-0022): the computed default refund
  // for a Departure, shown before removeMember confirms it. No side effects.
  router.get(
    "/:poolId/members/:memberId/departure/preview",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const preview = await membershipService.previewDeparture(
          req.params.poolId,
          req.userId as string,
          req.params.memberId,
        );
        res.status(200).json(preview);
      } catch (error) {
        handleMembershipError(error, res, next);
      }
    },
  );

  router.delete(
    "/:poolId/members/:memberId",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = removeMemberSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: "adjustedAmountPaise must be a non-negative integer" });
        return;
      }

      try {
        await membershipService.removeMember(
          req.params.poolId,
          req.userId as string,
          req.params.memberId,
          parsed.data.adjustedAmountPaise,
        );
        res.status(204).send();
      } catch (error) {
        handleMembershipError(error, res, next);
      }
    },
  );

  // Self-leave (ADR-0022/0023): any active, non-Organizer Member can remove
  // themselves — always paid the computed default, no adjustment.
  router.post(
    "/:poolId/leave",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const refund = await membershipService.leaveSelf(req.params.poolId, req.userId as string);
        res.status(200).json({ refund });
      } catch (error) {
        handleMembershipError(error, res, next);
      }
    },
  );

  // Organizer Transfer (ADR-0023): unilateral, no vote required.
  router.post(
    "/:poolId/organizer",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = transferOrganizerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "newOrganizerUserId is required" });
        return;
      }

      try {
        const updatedPool = await membershipService.transferOrganizer(
          req.params.poolId,
          req.userId as string,
          parsed.data.newOrganizerUserId,
        );
        res.status(200).json({ pool: updatedPool });
      } catch (error) {
        handleMembershipError(error, res, next);
      }
    },
  );

  return router;
}

// Shared by every Departure (preview/remove/leave) and Organizer Transfer
// route above — all draw from the same MembershipService error taxonomy.
function handleMembershipError(error: unknown, res: Response, next: (err: unknown) => void) {
  if (error instanceof PoolNotFoundError || error instanceof MemberNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof PoolClosedError ||
    error instanceof CannotRemoveOrganizerError ||
    error instanceof MemberHasNoRegisteredUpiIdError ||
    error instanceof TargetAlreadyOrganizerError
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
