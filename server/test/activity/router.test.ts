import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { InMemoryOtpStore } from "../../src/auth/fakes/in-memory-otp-store.js";
import { FakeOtpSender } from "../../src/auth/fakes/fake-otp-sender.js";
import { FakeIdentityProvider } from "../../src/auth/fakes/fake-identity-provider.js";
import { makeTestServices } from "../support/make-test-services.js";

const JWT_SECRET = "test-secret";
const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeApp() {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID, undefined, { name: "Rhea" });
  userRepository.seedVerifiedUser(MEMBER_ID, undefined, { name: "Maya" });
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
    activityService,
    notificationService,
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
    activityService,
    notificationService,
    jwtSecret: JWT_SECRET,
  });

  const createRes = await request(app)
    .post("/pools")
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000 });
  const pool = createRes.body.pool as { id: string };

  // Pay the Organizer's own share so the Pool is unlocked for Add Members
  // (ADR-0017) — this file exercises the Activity feed, not the payment gate.
  const organizerIntentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(ORGANIZER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ depositIntentId: organizerIntentRes.body.intent.id, amountPaise: 100000 });

  await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
  const intentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(MEMBER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(MEMBER_ID))
    .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 100000 });

  return { app, pool };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("GET /activity", () => {
  it("returns the cross-Pool feed for the authenticated user", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app).get("/activity").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    // Two Deposits into this Pool: the Organizer's own share (paid to unlock
    // the Dashboard, ADR-0017) and Maya's own — the feed includes both,
    // self included (see ActivityService.entriesForPool).
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "DEPOSIT",
          poolId: pool.id,
          poolName: "Goa Trip",
          amountPaise: 100000,
          counterpartyName: "Maya",
        }),
        expect.objectContaining({
          type: "DEPOSIT",
          poolId: pool.id,
          poolName: "Goa Trip",
          amountPaise: 100000,
          counterpartyName: "Rhea",
        }),
      ]),
    );
  });

  it("is empty for a user with no Pools", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/activity")
      .set("Authorization", bearerFor("user_no_pools"));

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = await makeApp();

    const res = await request(app).get("/activity");

    expect(res.status).toBe(401);
  });
});
