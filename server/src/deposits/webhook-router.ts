import { Router } from "express";
import type { DepositService } from "./deposit-service.js";
import type { PaymentProvider } from "../payments/types.js";

// Server-to-server: Decentro's own backend calls this, not a Pool Pay user,
// so no requireAuth/JWT. Instead gated by a shared secret in a header —
// exact scheme (header name, HMAC vs static token) unverified against
// Decentro's real webhook docs, same flagged-assumption pattern as the rest
// of ticket #14/#15; swap for whatever Decentro's callback auth actually is
// once sandbox access confirms it. If webhookSecret is unset (fakes/dev),
// the check is skipped entirely.
export function createDepositWebhookRouter(
  depositService: DepositService,
  paymentProvider: PaymentProvider,
  webhookSecret?: string,
): Router {
  const router = Router();

  router.post("/decentro/deposits", async (req, res) => {
    if (webhookSecret && req.header("x-decentro-webhook-secret") !== webhookSecret) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }

    const event = paymentProvider.parseDepositWebhook(req.body);
    if (event && event.status === "SUCCESS") {
      try {
        await depositService.confirmDeposit(event.providerRef, event.amountPaise);
      } catch (error) {
        // Retrying won't fix an unknown reference or a Pool/Member that no
        // longer qualifies — log it and ack anyway so Decentro stops retrying.
        console.error("Deposit webhook confirmation failed", error);
      }
    }

    // Ack unconditionally (per Decentro's callback docs: an unacked/non-200
    // response is retried up to 3x) — including unrecognized payloads, so a
    // callback for something this adapter doesn't handle doesn't retry-storm.
    res.status(200).json({ ack: true });
  });

  return router;
}
