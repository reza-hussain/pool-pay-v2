// Dev-only shortcut: drives a pending sandbox Cashfree "collect" order (a
// Deposit or a ticket #38 UPI ownership check — both are Orders underneath,
// see ADR 0015) through to confirmation without hand-crafting curl calls.
//
// Cashfree's sandbox test VPAs (testsuccess@gocash etc.) don't auto-resolve
// on this headless collect channel, and Cashfree can't deliver a webhook to
// localhost — so this script does what a real UPI-app approval + a reachable
// webhook endpoint would otherwise do:
//   1. Look up (or accept) a pending order's providerRef.
//   2. GET its payment attempt from Cashfree to get cf_payment_id.
//   3. POST /pg/simulate to flip that payment to SUCCESS (sandbox-only API).
//   4. Construct a real HMAC-signed PAYMENT_SUCCESS_WEBHOOK and POST it to
//      this server's own /webhooks/cashfree/deposits, exactly as Cashfree's
//      infra would.
//
// Refuses to run unless CASHFREE_ENV is "sandbox" — this lets anyone mark a
// payment SUCCESS, which must never be reachable against production.
//
// Usage:
//   npm run sandbox:verify-upi                 # auto-picks the newest pending row
//   npm run sandbox:verify-upi -- <providerRef> # target a specific order
import "dotenv/config";
import { createHmac } from "node:crypto";
import { env, hasCashfreePaymentCredentials } from "../src/lib/env.js";
import { prisma } from "../src/lib/prisma.js";
import { CashfreeClient } from "../src/payments/cashfree/client.js";

interface PaymentEntry {
  cf_payment_id: string;
  order_id: string;
  order_amount: number;
  payment_status: "SUCCESS" | "NOT_ATTEMPTED" | "FAILED" | "USER_DROPPED" | "VOID" | "CANCELLED" | "PENDING";
}

async function findPendingProviderRef(): Promise<{ providerRef: string; kind: string; detail: string } | null> {
  const [pendingDeposit, pendingOwnership] = await Promise.all([
    prisma.pendingDeposit.findFirst({
      where: { consumedAt: null },
      orderBy: { createdAt: "desc" },
      include: { pool: true, user: true },
    }),
    prisma.upiOwnershipConfirmation.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
  ]);

  const candidates = [
    pendingDeposit && {
      providerRef: pendingDeposit.providerRef,
      kind: "Deposit",
      detail: `pool ${pendingDeposit.pool.name} / user ${pendingDeposit.user.phoneNumber}`,
      createdAt: pendingDeposit.createdAt,
    },
    pendingOwnership && {
      providerRef: pendingOwnership.providerRef,
      kind: "UPI ownership check",
      detail: `upiId ${pendingOwnership.upiId} / user ${pendingOwnership.user.phoneNumber}`,
      createdAt: pendingOwnership.createdAt,
    },
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const [best] = candidates;
  return { providerRef: best.providerRef, kind: best.kind, detail: best.detail };
}

async function main() {
  if (env.CASHFREE_ENV !== "sandbox") {
    console.error(`Refusing to run: CASHFREE_ENV is "${env.CASHFREE_ENV}", not "sandbox".`);
    process.exit(1);
  }
  if (!hasCashfreePaymentCredentials) {
    console.error("Refusing to run: Cashfree payment credentials aren't configured (see server/.env).");
    process.exit(1);
  }

  let providerRef = process.argv[2];
  if (!providerRef) {
    const found = await findPendingProviderRef();
    if (!found) {
      console.error("No pending Deposit or UPI ownership check found. Pass a providerRef explicitly.");
      process.exit(1);
    }
    providerRef = found.providerRef;
    console.log(`Using most recent pending ${found.kind} (${found.detail}): ${providerRef}`);
  }

  const pgClient = new CashfreeClient({
    product: "pg",
    env: env.CASHFREE_ENV,
    clientId: env.CASHFREE_PG_CLIENT_ID!,
    clientSecret: env.CASHFREE_PG_CLIENT_SECRET!,
  });

  console.log(`Fetching payment attempts for order ${providerRef}...`);
  const payments = await pgClient.get<PaymentEntry[]>(`/orders/${providerRef}/payments`, {});
  if (payments.length === 0) {
    console.error(
      "No payment attempt exists yet for this order. The collect request may still be propagating — try again in a few seconds.",
    );
    process.exit(1);
  }
  const [payment] = payments;

  if (payment.payment_status !== "SUCCESS") {
    console.log(`Payment ${payment.cf_payment_id} is ${payment.payment_status} — simulating SUCCESS...`);
    await pgClient.post("/simulate", {
      entity: "PAYMENTS",
      entity_id: payment.cf_payment_id,
      entity_simulation: { payment_status: "SUCCESS" },
    });
  } else {
    console.log(`Payment ${payment.cf_payment_id} is already SUCCESS.`);
  }

  const rawBody = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: providerRef, order_amount: payment.order_amount },
      payment: { payment_status: "SUCCESS" },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", env.CASHFREE_PG_CLIENT_SECRET!)
    .update(timestamp + rawBody)
    .digest("base64");

  const webhookUrl = `http://localhost:${env.PORT}/webhooks/cashfree/deposits`;
  console.log(`Posting signed PAYMENT_SUCCESS_WEBHOOK to ${webhookUrl}...`);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    },
    body: rawBody,
  });

  if (!response.ok) {
    console.error(`Webhook POST failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  console.log(`Webhook accepted (${response.status}). ${providerRef} should now be confirmed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
