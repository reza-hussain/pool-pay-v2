import { Router, type Request } from "express";
import type { DepositService } from "./deposit-service.js";
import { UnknownDepositReferenceError } from "./types.js";
import type { AuthService } from "../auth/auth-service.js";
import type { PaymentProvider } from "../payments/types.js";

type RequestWithRawBody = Request & { rawBody?: Buffer };

// Server-to-server: Cashfree's own backend calls this, not a Pool Pay user,
// so no requireAuth/JWT. Authenticated instead via
// paymentProvider.verifyWebhookSignature, which checks Cashfree's real
// HMAC-SHA256 signature (x-webhook-signature/x-webhook-timestamp) over the
// raw request body — see CashfreePaymentProvider and app.ts's rawBody
// capture. The fake provider's version of this check always passes, so dev/
// test traffic is unaffected.
//
// Also resolves ticket #38's UPI ownership collect requests (ADR 0015) —
// both Deposits and ownership checks are Cashfree Orders underneath, so the
// same PAYMENT_SUCCESS_WEBHOOK callback covers either, distinguished only by
// which service recognizes the providerRef.
export function createDepositWebhookRouter(
  depositService: DepositService,
  authService: AuthService,
  paymentProvider: PaymentProvider,
): Router {
  const router = Router();

  router.post("/cashfree/deposits", async (req, res) => {
    const rawBody = (req as RequestWithRawBody).rawBody ?? Buffer.from(JSON.stringify(req.body));
    if (!paymentProvider.verifyWebhookSignature(rawBody, req.headers as Record<string, string | undefined>)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    const event = paymentProvider.parseDepositWebhook(req.body);
    if (event && event.status === "SUCCESS") {
      try {
        await depositService.confirmDeposit(event.providerRef, event.amountPaise);
      } catch (error) {
        if (error instanceof UnknownDepositReferenceError) {
          try {
            await authService.confirmUpiOwnership(event.providerRef, event.amountPaise);
          } catch (ownershipError) {
            console.error("UPI ownership webhook confirmation failed", ownershipError);
          }
        } else {
          // Retrying won't fix a Pool/Member that no longer qualifies — log
          // it and ack anyway so Cashfree stops retrying.
          console.error("Deposit webhook confirmation failed", error);
        }
      }
    }

    // Ack unconditionally (per Cashfree's webhook docs: an unacked/non-200
    // response is retried) — including unrecognized payloads, so a callback
    // for something this adapter doesn't handle doesn't retry-storm.
    res.status(200).json({ ack: true });
  });

  return router;
}
