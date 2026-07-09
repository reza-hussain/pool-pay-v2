import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthService } from "./auth-service.js";
import {
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpNotFoundError,
} from "./types.js";
import { signSessionToken } from "./session.js";

const requestOtpSchema = z.object({
  phoneNumber: z.string(),
});

const verifyOtpSchema = z.object({
  requestId: z.string(),
  code: z.string(),
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
        user: { id: user.id, phoneNumber: user.phoneNumber },
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

  return router;
}
