import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthService } from "./auth-service.js";
import {
  IdentityVerificationFailedError,
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpNotFoundError,
  type User,
} from "./types.js";
import { InvalidPanNumberError } from "./identity-provider.js";
import { signSessionToken } from "./session.js";
import { requireAuth, type AuthenticatedRequest } from "./require-auth.js";

function publicUser(user: User) {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    isVerified: user.isVerified,
    isSubscribed: user.isSubscribed,
  };
}

const requestOtpSchema = z.object({
  phoneNumber: z.string(),
});

const verifyOtpSchema = z.object({
  requestId: z.string(),
  code: z.string(),
});

const verifyIdentitySchema = z.object({
  panNumber: z.string(),
});

export function createAuthRouter(authService: AuthService, jwtSecret: string): Router {
  const router = Router();

  // A 6-digit OTP is brute-forceable without a cap on attempts — these limits
  // bound both request spam and code-guessing per client within the OTP's TTL.
  // Created per router instance so each app (and each test) gets its own counters.
  const requestOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const verifyOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post("/otp/request", requestOtpLimiter, async (req, res, next) => {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    try {
      const { requestId } = await authService.requestOtp(parsed.data.phoneNumber);
      res.status(200).json({ requestId });
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.post("/otp/verify", verifyOtpLimiter, async (req, res, next) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "requestId and code are required" });
      return;
    }

    try {
      const { user, isNewUser } = await authService.verifyOtp(
        parsed.data.requestId,
        parsed.data.code,
      );
      const token = signSessionToken(user.id, jwtSecret);
      res.status(200).json({
        token,
        isNewUser,
        user: publicUser(user),
      });
    } catch (error) {
      if (error instanceof OtpNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (
        error instanceof OtpAlreadyUsedError ||
        error instanceof OtpExpiredError ||
        error instanceof InvalidOtpCodeError
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  // Full-KYC (ticket #12, real check wired up by ticket #14). Only
  // Organizers are ever gated on this (ADR 0007); Members need nothing
  // beyond the phone verification already done by OTP signup.
  router.post(
    "/verify",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = verifyIdentitySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "panNumber is required" });
        return;
      }

      try {
        const user = await authService.verifyIdentity(req.userId as string, parsed.data.panNumber);
        res.status(200).json({ user: publicUser(user) });
      } catch (error) {
        if (error instanceof InvalidPanNumberError || error instanceof IdentityVerificationFailedError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  // Stubbed freemium subscription (ticket #13) — passes instantly, no real
  // billing flow yet.
  router.post(
    "/subscribe",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const user = await authService.subscribe(req.userId as string);
        res.status(200).json({ user: publicUser(user) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
