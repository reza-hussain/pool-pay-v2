import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { InMemoryOtpStore } from "../../src/auth/fakes/in-memory-otp-store.js";
import { FakeOtpSender } from "../../src/auth/fakes/fake-otp-sender.js";
import { FakeIdentityProvider } from "../../src/auth/fakes/fake-identity-provider.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import type { PaymentProvider } from "../../src/payments/types.js";
import { makeTestServices } from "../support/make-test-services.js";

const JWT_SECRET = "test-secret";
const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

// Only overrides verifyWebhookSignature — used to exercise the router's 401
// path without needing a real Cashfree signature (that's covered by
// CashfreePaymentProvider's own unit tests). Doesn't touch depositService's
// own paymentProvider, since createApp's paymentProvider param is only ever
// consumed by the webhook router (see app.ts).
class SignatureTogglePaymentProvider extends FakePaymentProvider {
  constructor(private readonly signatureIsValid: boolean) {
    super();
  }
  override verifyWebhookSignature(): boolean {
    return this.signatureIsValid;
  }
}

async function makeApp(webhookPaymentProvider?: PaymentProvider) {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  userRepository.seedVerifiedUser(MEMBER_ID);
  const authService = new AuthService({
    userRepository,
    otpStore: new InMemoryOtpStore(),
    otpSender: new FakeOtpSender(),
    identityProvider: new FakeIdentityProvider(),
  });
  const {
    poolService,
    membershipService,
    depositService,
    spendService,
    spendApprovalService,
    reimbursementService,
    ledgerService,
    closureService,
    voteService,
    analyticsService,
    notificationService,
    activityService,
    paymentProvider,
  } = makeTestServices({ userRepository });
  const app = createApp({
    authService,
    poolService,
    membershipService,
    depositService,
    spendService,
    spendApprovalService,
    reimbursementService,
    ledgerService,
    closureService,
    voteService,
    analyticsService,
    notificationService,
    activityService,
    jwtSecret: JWT_SECRET,
    paymentProvider: webhookPaymentProvider ?? paymentProvider,
  });

  const createRes = await request(app)
    .post("/pools")
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000 });
  const pool = createRes.body.pool as { id: string };

  // Pay the Organizer's own share so the Pool is unlocked for Add Members
  // (ADR-0017) — this file exercises the webhook confirmation path, not the
  // payment gate itself.
  const organizerIntentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(ORGANIZER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ depositIntentId: organizerIntentRes.body.intent.id, amountPaise: 100000 });

  await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

  return { app, pool, paymentProvider, depositService };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

async function getIntentId(app: Express, poolId: string, userId: string): Promise<string> {
  const res = await request(app)
    .get(`/pools/${poolId}/deposit-intent`)
    .set("Authorization", bearerFor(userId));
  return res.body.intent.id as string;
}

describe("POST /webhooks/cashfree/deposits", () => {
  it("confirms the deposit for the Member the intent was created for", async () => {
    const { app, pool, depositService } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .post("/webhooks/cashfree/deposits")
      .send({ providerRef: depositIntentId, amountPaise: 100000, status: "SUCCESS" });

    expect(res.status).toBe(200);
    // 200000: the Organizer's own already-paid share plus this Deposit.
    expect(await depositService.getPoolBalance(pool.id)).toBe(200000);
  });

  it("is idempotent against a retried callback", async () => {
    const { app, pool, depositService } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);
    const payload = { providerRef: depositIntentId, amountPaise: 100000, status: "SUCCESS" };

    await request(app).post("/webhooks/cashfree/deposits").send(payload);
    await request(app).post("/webhooks/cashfree/deposits").send(payload);

    expect(await depositService.getPoolBalance(pool.id)).toBe(200000);
  });

  it("doesn't double-credit when the self-report already confirmed the same reference", async () => {
    const { app, pool, depositService } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId, amountPaise: 100000 });

    await request(app)
      .post("/webhooks/cashfree/deposits")
      .send({ providerRef: depositIntentId, amountPaise: 100000, status: "SUCCESS" });

    expect(await depositService.getPoolBalance(pool.id)).toBe(200000);
  });

  it("acks (200) even for an unrecognized payload, so the caller doesn't retry-storm", async () => {
    const { app } = await makeApp();
    const res = await request(app).post("/webhooks/cashfree/deposits").send({ nonsense: true });
    expect(res.status).toBe(200);
  });

  it("acks (200) even when the referenced deposit can't be confirmed", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/webhooks/cashfree/deposits")
      .send({ providerRef: "does-not-exist", amountPaise: 1000, status: "SUCCESS" });
    expect(res.status).toBe(200);
  });

  it("ignores a FAILED status without confirming a deposit", async () => {
    const { app, pool, depositService } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    await request(app)
      .post("/webhooks/cashfree/deposits")
      .send({ providerRef: depositIntentId, amountPaise: 100000, status: "FAILED" });

    // 100000, not 0: the Organizer's own already-paid share, unaffected by
    // this FAILED webhook for the Member's separate deposit attempt.
    expect(await depositService.getPoolBalance(pool.id)).toBe(100000);
  });

  it("rejects a call whose webhook signature doesn't verify", async () => {
    const { app, pool } = await makeApp(new SignatureTogglePaymentProvider(false));
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .post("/webhooks/cashfree/deposits")
      .send({ providerRef: depositIntentId, amountPaise: 100000, status: "SUCCESS" });

    expect(res.status).toBe(401);
  });

  it("accepts a call whose webhook signature verifies", async () => {
    const { app, pool, depositService } = await makeApp(new SignatureTogglePaymentProvider(true));
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .post("/webhooks/cashfree/deposits")
      .send({ providerRef: depositIntentId, amountPaise: 100000, status: "SUCCESS" });

    expect(res.status).toBe(200);
    expect(await depositService.getPoolBalance(pool.id)).toBe(200000);
  });
});
