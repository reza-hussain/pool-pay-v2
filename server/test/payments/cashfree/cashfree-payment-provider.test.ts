import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CashfreePaymentProvider } from "../../../src/payments/cashfree/cashfree-payment-provider.js";

// Only exercises the pure, network-free logic (signature verification and
// webhook payload parsing) — the same scope the fake's own test file covers
// for the equivalent methods. The network-calling methods (createDepositIntent,
// initiateSpend/Transfer, verifyVpa) need a live Cashfree sandbox to verify
// meaningfully, same caveat the Decentro adapter carried.
function makeProvider() {
  return new CashfreePaymentProvider({
    env: "sandbox",
    pg: { clientId: "pg-id", clientSecret: "pg-secret" },
    payout: { clientId: "payout-id", clientSecret: "payout-secret" },
    verification: { clientId: "verification-id", clientSecret: "verification-secret" },
    virtualVpa: "poolpay@upi",
  });
}

function sign(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

describe("CashfreePaymentProvider.verifyWebhookSignature", () => {
  it("accepts a signature computed the same way Cashfree documents", () => {
    const provider = makeProvider();
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1700000000";
    const signature = sign("pg-secret", timestamp, rawBody);

    const result = provider.verifyWebhookSignature(Buffer.from(rawBody), {
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
    });

    expect(result).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const provider = makeProvider();
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1700000000";
    const signature = sign("wrong-secret", timestamp, rawBody);

    const result = provider.verifyWebhookSignature(Buffer.from(rawBody), {
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
    });

    expect(result).toBe(false);
  });

  it("rejects a signature computed over a different body (tampered payload)", () => {
    const provider = makeProvider();
    const timestamp = "1700000000";
    const signature = sign("pg-secret", timestamp, JSON.stringify({ hello: "world" }));

    const result = provider.verifyWebhookSignature(Buffer.from(JSON.stringify({ hello: "tampered" })), {
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
    });

    expect(result).toBe(false);
  });

  it("rejects when the signature or timestamp header is missing", () => {
    const provider = makeProvider();
    const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));

    expect(provider.verifyWebhookSignature(rawBody, { "x-webhook-timestamp": "1700000000" })).toBe(false);
    expect(provider.verifyWebhookSignature(rawBody, { "x-webhook-signature": "abc" })).toBe(false);
    expect(provider.verifyWebhookSignature(rawBody, {})).toBe(false);
  });
});

describe("CashfreePaymentProvider.parseDepositWebhook", () => {
  it("parses a PAYMENT_SUCCESS_WEBHOOK payload", () => {
    const provider = makeProvider();

    const event = provider.parseDepositWebhook({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: {
        order: { order_id: "dep_abc123", order_amount: 1000 },
        payment: { payment_status: "SUCCESS" },
      },
    });

    expect(event).toEqual({ providerRef: "dep_abc123", amountPaise: 100000, status: "SUCCESS" });
  });

  it("maps a non-SUCCESS payment status to FAILED", () => {
    const provider = makeProvider();

    const event = provider.parseDepositWebhook({
      type: "PAYMENT_FAILED_WEBHOOK",
      data: {
        order: { order_id: "dep_abc123", order_amount: 1000 },
        payment: { payment_status: "FAILED" },
      },
    });

    expect(event).toEqual({ providerRef: "dep_abc123", amountPaise: 100000, status: "FAILED" });
  });

  it("returns null for an unrecognized payload", () => {
    const provider = makeProvider();
    expect(provider.parseDepositWebhook({ nonsense: true })).toBeNull();
    expect(provider.parseDepositWebhook(null)).toBeNull();
    expect(provider.parseDepositWebhook({ data: { order: {} } })).toBeNull();
  });
});
