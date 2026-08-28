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
  });

  const createRes = await request(app)
    .post("/pools")
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000 });
  const pool = createRes.body.pool as { id: string };

  // Pay the Organizer's own share so the Pool is unlocked for Add Members
  // (ADR-0017) — this also adds one DEPOSIT entry to the ledger.
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

describe("GET /pools/:poolId/ledger", () => {
  it("returns the ledger for a Member of the Pool", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    // Two DEPOSIT entries: the Organizer's own share (ADR-0017) plus this
    // Member's.
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "DEPOSIT", amountPaise: 100000 })]),
    );
  });

  it("returns the ledger for the Organizer too", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
  });

  it("returns 403 for a non-Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .set("Authorization", bearerFor("user_stranger"));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/pools/pool_missing/ledger")
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app).get(`/pools/${pool.id}/ledger`);

    expect(res.status).toBe(401);
  });

  it("includes a nextCursor field in the response", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("nextCursor");
  });

  it("accepts a `types` query param and reflects it in the results", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ types: "SPEND" })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("accepts a `counterparty` query param and reflects it in the results", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ counterparty: MEMBER_ID })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({ type: "DEPOSIT", counterparty: MEMBER_ID });
  });

  it("accepts a `search` query param and reflects it in the results", async () => {
    const { app, pool } = await makeApp();
    const suffix = MEMBER_ID.slice(-4);

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ search: suffix })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({ type: "DEPOSIT", counterparty: MEMBER_ID });
  });

  it("accepts a `from` query param and reflects it in the results", async () => {
    const { app, pool } = await makeApp();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ from: future })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("accepts a `to` query param and reflects it in the results", async () => {
    const { app, pool } = await makeApp();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ to: past })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("accepts `limit` and `cursor` query params and paginates the results", async () => {
    const { app, pool } = await makeApp();

    const firstPage = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ limit: 1 })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.entries).toHaveLength(1);
    expect(firstPage.body.nextCursor).not.toBeNull();

    const secondPage = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ limit: 1, cursor: firstPage.body.nextCursor })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.entries).toHaveLength(1);
    expect(secondPage.body.entries[0].id).not.toBe(firstPage.body.entries[0].id);
  });

  it("returns 403 for a non-Member even when query params are supplied", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .query({ search: "anything" })
      .set("Authorization", bearerFor("user_stranger"));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown pool even when query params are supplied", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/pools/pool_missing/ledger")
      .query({ search: "anything" })
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(404);
  });
});

describe("GET /pools/:poolId/balance", () => {
  it("returns the Pool's current balance for a Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/balance`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    // Organizer's own share (ADR-0017) + this Member's Deposit, no Spends yet.
    expect(res.body).toEqual({ balancePaise: 200000 });
  });

  it("returns the balance for the Organizer too", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/balance`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balancePaise: 200000 });
  });

  it("returns 403 for a non-Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/balance`)
      .set("Authorization", bearerFor("user_stranger"));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/pools/pool_missing/balance")
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app).get(`/pools/${pool.id}/balance`);

    expect(res.status).toBe(401);
  });
});

describe("GET /pools/:poolId/members/me/balance", () => {
  it("returns the caller's own remaining balance, not the Pool-wide balance", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/members/me/balance`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    // Just this Member's own Deposit — distinct from the Pool-wide 200000.
    expect(res.body).toEqual({ balancePaise: 100000 });
  });

  it("returns the Organizer's own balance for the Organizer", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/members/me/balance`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balancePaise: 100000 });
  });

  it("returns 403 for a non-Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/members/me/balance`)
      .set("Authorization", bearerFor("user_stranger"));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/pools/pool_missing/members/me/balance")
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app).get(`/pools/${pool.id}/members/me/balance`);

    expect(res.status).toBe(401);
  });
});
