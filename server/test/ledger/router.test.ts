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

  it("filters by types via a comma-separated query param", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?types=SPEND`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it("filters by a subset of multiple types via a comma-separated query param", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?types=SPEND,DEPOSIT`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    // No SPEND entries exist in this fixture, but both DEPOSIT entries pass.
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.every((e: { type: string }) => e.type === "DEPOSIT")).toBe(true);
  });

  it("filters by counterparty via a query param", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?counterparty=${ORGANIZER_ID}`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].counterparty).toBe(ORGANIZER_ID);
  });

  it("filters by search via a query param", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?search=${MEMBER_ID.slice(-4)}`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].counterparty).toBe(MEMBER_ID);
  });

  it("exposes a Spend's actor, and search matches its full merchantRef", async () => {
    const { app, pool } = await makeApp();
    await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "roadside-snacks@upi", amountPaise: 5000 });

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?search=roadside`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      type: "SPEND",
      counterparty: "roadside-snacks@upi",
      actor: ORGANIZER_ID,
    });
  });

  it("filters by date range via from/to query params", async () => {
    const { app, pool } = await makeApp();
    const future = new Date(Date.now() + 60_000).toISOString();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?from=${encodeURIComponent(future)}`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it("paginates via limit/cursor query params and returns nextCursor", async () => {
    const { app, pool } = await makeApp();

    const page1 = await request(app)
      .get(`/pools/${pool.id}/ledger?limit=1`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(page1.status).toBe(200);
    expect(page1.body.entries).toHaveLength(1);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app)
      .get(`/pools/${pool.id}/ledger?limit=1&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(page2.status).toBe(200);
    expect(page2.body.entries).toHaveLength(1);
    expect(page2.body.entries[0].id).not.toBe(page1.body.entries[0].id);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("returns 400 for a malformed cursor", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger?cursor=not-a-real-cursor`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(400);
  });

  it("exposes a Spend's actor without changing 401/403/404 behavior", async () => {
    const { app, pool } = await makeApp();

    const missingPoolRes = await request(app)
      .get("/pools/pool_missing/ledger?types=SPEND")
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(missingPoolRes.status).toBe(404);

    const strangerRes = await request(app)
      .get(`/pools/${pool.id}/ledger?types=SPEND`)
      .set("Authorization", bearerFor("user_stranger"));
    expect(strangerRes.status).toBe(403);

    const unauthedRes = await request(app).get(`/pools/${pool.id}/ledger?types=SPEND`);
    expect(unauthedRes.status).toBe(401);
  });
});
