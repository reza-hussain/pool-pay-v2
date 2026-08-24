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
import { makeTestServices } from "../support/make-test-services.js";

const JWT_SECRET = "test-secret";
const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeApp() {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  userRepository.seedVerifiedUser(MEMBER_ID);
  userRepository.seedVerifiedUser("user_stranger");
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
    .send({ name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000 });
  const pool = createRes.body.pool as { id: string };

  // Pay the Organizer's own share so the Pool is unlocked for Add Members
  // (ADR-0017) — this file exercises other Members' deposits, not the
  // payment gate itself (see the dedicated describe block below for that).
  const organizerIntentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(ORGANIZER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ depositIntentId: organizerIntentRes.body.intent.id, amountPaise: 100000 });

  await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

  return { app, pool };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("GET /pools/:poolId/deposit-intent", () => {
  it("returns a locked amount for an Equal Split Pool", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.intent).toMatchObject({ poolId: pool.id, fixedAmountPaise: 100000 });
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .get("/pools/does-not-exist/deposit-intent")
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 400 for an existing Open Pool — Open Pool deposits are retired", async () => {
    const { app } = await makeApp();
    const createRes = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Flat 3B Rent", type: "OPEN" });
    const openPool = createRes.body.pool as { id: string };
    await request(app).post(`/pools/${openPool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .get(`/pools/${openPool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no longer accept new Deposits/i);
  });
});

async function getIntentId(app: Express, poolId: string, userId: string): Promise<string> {
  const res = await request(app)
    .get(`/pools/${poolId}/deposit-intent`)
    .set("Authorization", bearerFor(userId));
  return res.body.intent.id as string;
}

describe("POST /pools/:poolId/deposits", () => {
  it("records a matching deposit and reports the updated balance", async () => {
    const { app, pool } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId, amountPaise: 100000 });

    expect(res.status).toBe(201);
    expect(res.body.deposit).toMatchObject({ poolId: pool.id, userId: MEMBER_ID, amountPaise: 100000 });
    // 200000, not 100000: the Organizer's own share (paid to unlock the
    // Pool, ADR-0017) is already in the balance before this Member deposits.
    expect(res.body.poolBalancePaise).toBe(200000);
    expect(res.body.contributionSummary).toEqual({
      contributedPaise: 100000,
      expectedPaise: 100000,
      shortfallPaise: 0,
    });
  });

  it("accepts a mismatched amount for an Equal Split Pool", async () => {
    const { app, pool } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId, amountPaise: 40000 });

    expect(res.status).toBe(201);
    expect(res.body.contributionSummary.shortfallPaise).toBe(60000);
  });

  it("returns 403 for a user who hasn't joined the Pool", async () => {
    const { app, pool } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, "user_stranger");

    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor("user_stranger"))
      .send({ depositIntentId, amountPaise: 100000 });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown deposit reference", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId: "does-not-exist", amountPaise: 1000 });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the reference belongs to a different pool or user", async () => {
    const { app, pool } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const wrongUser = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ depositIntentId, amountPaise: 100000 });
    expect(wrongUser.status).toBe(404);
  });

  it("is idempotent — confirming the same reference twice doesn't double-credit", async () => {
    const { app, pool } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId, amountPaise: 100000 });
    const second = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId, amountPaise: 100000 });

    expect(second.status).toBe(201);
    // 200000, not 100000: includes the Organizer's own already-paid share.
    expect(second.body.poolBalancePaise).toBe(200000);
  });

  it("returns 400 for a non-positive amount", async () => {
    const { app, pool } = await makeApp();
    const depositIntentId = await getIntentId(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId, amountPaise: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).post(`/pools/${pool.id}/deposits`).send({
      depositIntentId: "irrelevant",
      amountPaise: 1000,
    });
    expect(res.status).toBe(401);
  });
});

describe("Custom Split Pool creation gated on the Organizer's own payment (ticket #58)", () => {
  async function createCustomSplitPool(app: Express, assignedAmountPaise = 30000) {
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Uneven Dinner", type: "CUSTOM_SPLIT", organizerShareAmountPaise: assignedAmountPaise });
    return res.body.pool as { id: string };
  }

  it("locks the deposit-intent amount to the Organizer's own assigned share", async () => {
    const { app } = await makeApp();
    const pool = await createCustomSplitPool(app, 30000);

    const res = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.intent).toMatchObject({ poolId: pool.id, fixedAmountPaise: 30000 });
  });

  it("returns 404 for someone with no Invitation on the Pool", async () => {
    const { app } = await makeApp();
    const pool = await createCustomSplitPool(app, 30000);

    const res = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor("user_stranger"));

    expect(res.status).toBe(404);
  });

  it("makes the Organizer the Pool's sole Member on an exact-match payment", async () => {
    const { app } = await makeApp();
    const pool = await createCustomSplitPool(app, 30000);
    const depositIntentId = await getIntentId(app, pool.id, ORGANIZER_ID);

    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ depositIntentId, amountPaise: 30000 });

    expect(res.status).toBe(201);
    expect(res.body.deposit).toMatchObject({ poolId: pool.id, userId: ORGANIZER_ID, amountPaise: 30000 });

    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members).toHaveLength(1);
    expect(membersRes.body.members[0]).toMatchObject({ userId: ORGANIZER_ID, role: "ORGANIZER" });
  });

  it("rejects a payment that doesn't exactly match the assigned amount, without creating a Membership", async () => {
    const { app } = await makeApp();
    const pool = await createCustomSplitPool(app, 30000);
    const depositIntentId = await getIntentId(app, pool.id, ORGANIZER_ID);

    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ depositIntentId, amountPaise: 20000 });

    expect(res.status).toBe(400);
    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members).toEqual([]);
  });
});
