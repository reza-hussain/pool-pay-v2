import { Router } from "express";
import { z } from "zod";
import type { InvitationService } from "./invitation-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { NotCustomSplitPoolError, NotPoolOrganizerError } from "../pools/types.js";
import {
  InvalidInvitationAmountError,
  InvalidInvitationExpiryPresetError,
  InvitationAlreadyPendingError,
  InvitationNotAcceptableError,
  InvitationNotCancellableError,
  InvitationNotFoundForAccepterError,
  InvitationRecordNotFoundError,
  InvitationRequiresPaymentError,
  InvitationLinkNotFoundError,
  InviteeAlreadyMemberError,
  InviteeNotRegisteredError,
  NotEqualSplitPoolError,
  OrganizerNotAMemberError,
} from "./types.js";

// assignedAmountPaise omitted (rather than sent as 0/null) selects the
// Equal Split phone/contact variant (ticket #87) — Custom Split's targeted
// Invitation still requires it.
const sendInvitationSchema = z.object({
  phoneNumber: z.string(),
  assignedAmountPaise: z.number().optional(),
  expiryPreset: z.enum(["24h", "3d", "7d"]).optional(),
});

// Mounted at /pools — Organizer-only actions and views scoped to one Pool.
export function createInvitationsRouter(invitationService: InvitationService, jwtSecret: string): Router {
  const router = Router();

  router.post(
    "/:poolId/invitations",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = sendInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "phoneNumber is required" });
        return;
      }

      try {
        const invitation =
          parsed.data.assignedAmountPaise !== undefined
            ? await invitationService.sendInvitation(
                req.userId as string,
                req.params.poolId,
                parsed.data.phoneNumber,
                parsed.data.assignedAmountPaise,
                parsed.data.expiryPreset,
              )
            : await invitationService.sendEqualSplitInvitation(
                req.userId as string,
                req.params.poolId,
                parsed.data.phoneNumber,
                parsed.data.expiryPreset,
              );
        res.status(201).json({ invitation });
      } catch (error) {
        if (error instanceof PoolNotFoundError || error instanceof InviteeNotRegisteredError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (
          error instanceof InvalidInvitationAmountError ||
          error instanceof InvalidInvitationExpiryPresetError ||
          error instanceof NotCustomSplitPoolError ||
          error instanceof NotEqualSplitPoolError ||
          error instanceof InviteeAlreadyMemberError ||
          error instanceof InvitationAlreadyPendingError
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof NotPoolOrganizerError || error instanceof OrganizerNotAMemberError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.get(
    "/:poolId/invitations",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const invitations = await invitationService.listSentInvitations(
          req.params.poolId,
          req.userId as string,
        );
        res.status(200).json({ invitations });
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

  router.delete(
    "/:poolId/invitations/:invitationId",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        await invitationService.cancelInvitation(
          req.userId as string,
          req.params.poolId,
          req.params.invitationId,
        );
        res.status(204).send();
      } catch (error) {
        if (error instanceof PoolNotFoundError || error instanceof InvitationRecordNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof InvitationNotCancellableError) {
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

// Mounted at /invitations — the invitee's own cross-Pool view, so it can't
// live under /pools/:poolId (there's no single Pool to scope it to).
export function createMyInvitationsRouter(invitationService: InvitationService, jwtSecret: string): Router {
  const router = Router();

  router.get("/mine", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const invitations = await invitationService.listMyInvitations(req.userId as string);
      res.status(200).json({ invitations });
    } catch (error) {
      next(error);
    }
  });

  // Resolves the shareable Invitation link (ticket #61). 404 for both an
  // unknown token and one that names a different signed-in user — see
  // InvitationLinkNotFoundError.
  router.get("/token/:token", requireAuth(jwtSecret), async (req: AuthenticatedRequest, res, next) => {
    try {
      const invitationForInvitee = await invitationService.getInvitationByToken(
        req.params.token,
        req.userId as string,
      );
      res.status(200).json({ invitationForInvitee });
    } catch (error) {
      if (error instanceof InvitationLinkNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  // Invitee accepts the Equal Split phone/contact Invitation variant (ticket
  // #87) — creates a Membership immediately, at zero cost, no Deposit. A
  // Custom Split (assigned-amount) Invitation is rejected here; that one is
  // only resolved by paying (see the Deposit endpoints).
  router.post(
    "/:invitationId/accept",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const membership = await invitationService.acceptInvitation(
          req.params.invitationId,
          req.userId as string,
        );
        res.status(200).json({ membership });
      } catch (error) {
        if (error instanceof InvitationNotFoundForAccepterError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (
          error instanceof InvitationNotAcceptableError ||
          error instanceof InvitationRequiresPaymentError
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
