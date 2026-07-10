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

function makeApp() {
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
    poolRepository,
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
  return { app, poolRepository };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("POST /pools", () => {
  it("creates an Equal Split Pool for the authenticated organizer", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000 });

    expect(res.status).toBe(201);
    expect(res.body.pool).toMatchObject({
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      state: "ACTIVE",
      organizerId: ORGANIZER_ID,
    });
  });

  it("creates an Open Pool", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Flat 3B Rent", type: "OPEN" });

    expect(res.status).toBe(201);
    expect(res.body.pool.type).toBe("OPEN");
    expect(res.body.pool.perPersonAmountPaise).toBeNull();
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/pools")
      .send({ name: "Goa Trip", type: "OPEN" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an Equal Split Pool with no per-person amount", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Goa Trip", type: "EQUAL_SPLIT" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing name", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ type: "OPEN" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for an unverified user (ticket #12)", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor("user_not_yet_verified"))
      .send({ name: "Goa Trip", type: "OPEN" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-subscribed user's 4th concurrently Active Pool (ticket #13)", async () => {
    const { app } = makeApp();
    for (const name of ["Pool 1", "Pool 2", "Pool 3"]) {
      const res = await request(app)
        .post("/pools")
        .set("Authorization", bearerFor(ORGANIZER_ID))
        .send({ name, type: "OPEN" });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Pool 4", type: "OPEN" });
    expect(res.status).toBe(403);
  });
});

describe("POST /pools/:poolId/lock", () => {
  async function createPool(app: import("express").Express) {
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Goa Trip", type: "OPEN" });
    return res.body.pool;
  }

  it("locks the Pool for the Organizer", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);

    const res = await request(app)
      .post(`/pools/${pool.id}/lock`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.pool.state).toBe("LOCKED");
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);

    const res = await request(app)
      .post(`/pools/${pool.id}/lock`)
      .set("Authorization", bearerFor("user_someone_else"));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/pools/pool_missing/lock")
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);

    const res = await request(app).post(`/pools/${pool.id}/lock`);

    expect(res.status).toBe(401);
  });
});
