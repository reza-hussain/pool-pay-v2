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
  ProfileIncompleteError,
  UnderageError,
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
    name: user.name,
    email: user.email,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    upiId: user.upiId,
    avatarUrl: user.avatarUrl,
    isOnboarded: user.isOnboarded,
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

const verifyUpiIdSchema = z.object({
  upiId: z.string().trim().min(1),
});

// Onboarding's profile-setup step (CONTEXT.md, ADR 0012) — dateOfBirth comes
// in as "YYYY-MM-DD" (a date, not a timestamp) since time-of-day is never
// relevant to the age gate.
const completeProfileSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD"),
  upiId: z.string().trim().min(1),
  avatarUrl: z.string().trim().min(1).nullable().optional(),
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

  // A real VerifyPay call is a real penny-drop in production — this bounds
  // both cost and abuse (e.g. probing arbitrary VPAs for their bank name).
  const verifyUpiIdLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
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
        if (
          error instanceof InvalidPanNumberError ||
          error instanceof IdentityVerificationFailedError ||
          error instanceof ProfileIncompleteError
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  // Onboarding's Registered UPI ID (ADR 0012) — checked before the person
  // can submit it via complete-profile. Doesn't persist anything; a
  // not-verified result is a normal outcome (typo, invalid VPA), not a
  // server error.
  router.post(
    "/verify-upi-id",
    requireAuth(jwtSecret),
    verifyUpiIdLimiter,
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = verifyUpiIdSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "upiId is required" });
        return;
      }

      try {
        const result = await authService.verifyUpiId(parsed.data.upiId);
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // Onboarding's profile-setup step (CONTEXT.md, ADR 0012) — mandatory,
  // one-time, blocks reaching Home. Every field but avatarUrl is required.
  router.post(
    "/complete-profile",
    requireAuth(jwtSecret),
    async (req: AuthenticatedRequest, res, next) => {
      const parsed = completeProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "name, email, dateOfBirth, and upiId are required" });
        return;
      }

      try {
        const user = await authService.completeProfile(req.userId as string, {
          name: parsed.data.name,
          email: parsed.data.email,
          dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`),
          upiId: parsed.data.upiId,
          avatarUrl: parsed.data.avatarUrl ?? null,
        });
        res.status(200).json({ user: publicUser(user) });
      } catch (error) {
        if (error instanceof UnderageError) {
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
