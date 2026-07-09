import { Router } from "express";
import { z } from "zod";
import type { PoolService } from "./pool-service.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/require-auth.js";
import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MissingPerPersonAmountError,
  UnexpectedPerPersonAmountError,
} from "./types.js";

const createPoolSchema = z.object({
  name: z.string(),
  type: z.enum(["EQUAL_SPLIT", "OPEN"]),
  perPersonAmountPaise: z.number().optional(),
});

export function createPoolsRouter(poolService: PoolService, jwtSecret: string): Router {
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

  return router;
}
