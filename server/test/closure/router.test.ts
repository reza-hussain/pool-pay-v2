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
import { joinAndApprove } from "../support/join-and-approve.js";

const JWT_SECRET = "test-secret";
const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeApp() {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID, undefined, { upiId: `${ORGANIZER_ID}@upi` });
  // Onboarding (ADR 0012) guarantees every Member has a Registered UPI ID by
  // the time they can join/deposit into a Pool — Closure now requires one.
  userRepository.seedVerifiedUser(MEMBER_ID, undefined, { upiId: `${MEMBER_ID}@upi` });
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
    reimbursementService,
    ledgerService,
    closureService,
    voteService,
    analyticsService,
    notificationService,
    activityService,
    joinRequestService,
  } = makeTestServices({ userRepository });
  const app = createApp({
    authService,
    poolService,
    membershipService,
    depositService,
    spendService,
    reimbursementService,
    ledgerService,
    closureService,
    voteService,
    analyticsService,
    notificationService,
    activityService,
    joinRequestService,
    jwtSecret: JWT_SECRET,
  });

  const createRes = await request(app)
    .post("/pools")
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000 });
  const pool = createRes.body.pool as { id: string };

  // Pay the Organizer's own share so the Pool is unlocked for Add Members
  // (ADR-0017) — this also means the Organizer contributed 100000, refunded
  // pro-rata just like any other Member on Closure.
  const organizerIntentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(ORGANIZER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ depositIntentId: organizerIntentRes.body.intent.id, amountPaise: 100000 });

  await joinAndApprove(app, pool.id, ORGANIZER_ID, MEMBER_ID, bearerFor);
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

describe("GET /pools/:poolId/close/preview", () => {
  it("returns the refund breakdown without closing the Pool", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/close/preview`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.refundTotalPaise).toBe(200000);
    expect(res.body.refunds).toEqual(
      expect.arrayContaining([
        { memberId: MEMBER_ID, contributedPaise: 100000, amountPaise: 100000 },
        { memberId: ORGANIZER_ID, contributedPaise: 100000, amountPaise: 100000 },
      ]),
    );
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .get(`/pools/${pool.id}/close/preview`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .get("/pools/pool_missing/close/preview")
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(404);
  });
});

describe("POST /pools/:poolId/close", () => {
  it("closes the Pool and refunds each Member pro-rata", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/close`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.pool.state).toBe("CLOSED");
    expect(res.body.refundTotalPaise).toBe(200000);
    expect(res.body.refunds).toHaveLength(2);
    expect(res.body.refunds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: MEMBER_ID, amountPaise: 100000 }),
        expect.objectContaining({ memberId: ORGANIZER_ID, amountPaise: 100000 }),
      ]),
    );
  });

  it("returns 400 when closing an already-Closed Pool", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/close`).set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app)
      .post(`/pools/${pool.id}/close`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/close`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/pool_missing/close")
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).post(`/pools/${pool.id}/close`);
    expect(res.status).toBe(401);
  });

  it("a Closed Pool no longer accepts deposits or Spends", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/close`).set("Authorization", bearerFor(ORGANIZER_ID));

    const closedIntentRes = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));
    const depositRes = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId: closedIntentRes.body.intent.id, amountPaise: 1000 });
    expect(depositRes.status).toBe(400);

    const spendRes = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 1000 });
    expect(spendRes.status).toBe(400);
  });
});

describe("Closing an existing (retired) Open Pool", () => {
  it("still closes and refunds pro-rata, even though it can no longer accept new Deposits", async () => {
    const userRepository = new InMemoryUserRepository();
    userRepository.seedVerifiedUser(ORGANIZER_ID, undefined, { upiId: `${ORGANIZER_ID}@upi` });
    userRepository.seedVerifiedUser(MEMBER_ID, undefined, { upiId: `${MEMBER_ID}@upi` });
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
      reimbursementService,
      ledgerService,
      closureService,
      voteService,
      analyticsService,
      notificationService,
      activityService,
      pendingDepositRepository,
    } = makeTestServices({ userRepository });
    const app = createApp({
      authService,
      poolService,
      membershipService,
      depositService,
      spendService,
      reimbursementService,
      ledgerService,
      closureService,
      voteService,
      analyticsService,
      notificationService,
      activityService,
      jwtSecret: JWT_SECRET,
    });

    const createRes = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Flat 3B Rent", type: "OPEN" });
    const openPool = createRes.body.pool as { id: string };
    await request(app).post(`/pools/${openPool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    // Open Pool Deposits are retired at createDepositIntent (ticket #59), so
    // this bypasses it to seed the Deposit this Open Pool already held before
    // that rule shipped — exactly the money Closure still needs to refund.
    await pendingDepositRepository.create("legacy-ref", openPool.id, MEMBER_ID);
    await depositService.confirmDeposit("legacy-ref", 60000);

    const res = await request(app)
      .post(`/pools/${openPool.id}/close`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.pool.state).toBe("CLOSED");
    expect(res.body.refundTotalPaise).toBe(60000);
    expect(res.body.refunds).toHaveLength(1);
    expect(res.body.refunds[0]).toMatchObject({ memberId: MEMBER_ID, amountPaise: 60000 });

    const depositAttempt = await request(app)
      .get(`/pools/${openPool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(depositAttempt.status).toBe(400);
  });
});
