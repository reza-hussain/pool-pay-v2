import { Router } from "express";
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

  router.post("/otp/request", async (req, res, next) => {
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

  router.post("/otp/verify", async (req, res, next) => {
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
