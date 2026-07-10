import { Router, type Response } from "express";
import type { VoteService } from "./vote-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import { AlreadyVotedError, NotAPoolMemberError, OrganizerCannotVoteError } from "./types.js";

export function createVotesRouter(voteService: VoteService, jwtSecret: string): Router {
  const router = Router();

  router.get(
    "/:poolId/refund-votes",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const status = await voteService.getVoteStatus(req.params.poolId, req.userId as string);
        res.status(200).json(status);
      } catch (error) {
        handleVoteError(error, res, next);
      }
    },
  );

  router.post(
    "/:poolId/refund-votes",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const result = await voteService.castVote(req.params.poolId, req.userId as string);
        res.status(201).json(result);
      } catch (error) {
        handleVoteError(error, res, next);
      }
    },
  );

  return router;
}

function handleVoteError(error: unknown, res: Response, next: (err: unknown) => void) {
  if (error instanceof PoolNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof PoolClosedError ||
    error instanceof OrganizerCannotVoteError ||
    error instanceof AlreadyVotedError
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
