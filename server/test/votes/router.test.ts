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
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";

async function makeApp() {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
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
    jwtSecret: JWT_SECRET,
  });

  const createRes = await request(app)
    .post("/pools")
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ name: "Goa Trip", type: "OPEN" });
  const pool = createRes.body.pool as { id: string };

  await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_A));
  await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_B));
  const intentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(MEMBER_A));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(MEMBER_A))
    .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 100000 });

  return { app, pool };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("POST /pools/:poolId/refund-votes", () => {
  it("records a vote and reports it did not yet reach a majority", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor(MEMBER_A));

    expect(res.status).toBe(201);
    expect(res.body.closure).toBeNull();
    expect(res.body.status).toMatchObject({ votesCast: 1, eligibleVoterCount: 2 });
  });

  it("closes the Pool once a majority is reached", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/refund-votes`).set("Authorization", bearerFor(MEMBER_A));

    const res = await request(app)
      .post(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor(MEMBER_B));

    expect(res.status).toBe(201);
    expect(res.body.closure).not.toBeNull();
    expect(res.body.closure.pool.state).toBe("CLOSED");
  });

  it("returns 400 for the Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a second vote from the same Member", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/refund-votes`).set("Authorization", bearerFor(MEMBER_A));

    const res = await request(app)
      .post(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor(MEMBER_A));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-Member", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor("user_stranger"));
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/pool_missing/refund-votes")
      .set("Authorization", bearerFor(MEMBER_A));
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).post(`/pools/${pool.id}/refund-votes`);
    expect(res.status).toBe(401);
  });
});

describe("GET /pools/:poolId/refund-votes", () => {
  it("reports the current tally", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/refund-votes`).set("Authorization", bearerFor(MEMBER_A));

    const res = await request(app)
      .get(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor(MEMBER_B));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      poolState: "ACTIVE",
      eligibleVoterCount: 2,
      votesCast: 1,
      hasVoted: false,
    });
  });

  it("returns 403 for a non-Member", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .get(`/pools/${pool.id}/refund-votes`)
      .set("Authorization", bearerFor("user_stranger"));
    expect(res.status).toBe(403);
  });
});
