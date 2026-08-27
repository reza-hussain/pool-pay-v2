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
    notificationService,
    activityService,
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
    notificationService,
    activityService,
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

  it("creates a Custom Split Pool with no per-person amount (ticket #58)", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Uneven Dinner", type: "CUSTOM_SPLIT", organizerShareAmountPaise: 30000 });

    expect(res.status).toBe(201);
    expect(res.body.pool).toMatchObject({
      name: "Uneven Dinner",
      type: "CUSTOM_SPLIT",
      perPersonAmountPaise: null,
      state: "ACTIVE",
      organizerId: ORGANIZER_ID,
    });
  });

  it("does not list the Organizer as a Member of a Custom Split Pool before they pay", async () => {
    const { app } = makeApp();
    const createRes = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Uneven Dinner", type: "CUSTOM_SPLIT", organizerShareAmountPaise: 30000 });

    const membersRes = await request(app)
      .get(`/pools/${createRes.body.pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(membersRes.body.members).toEqual([]);
  });

  it("returns 400 for a Custom Split Pool with no Organizer share amount", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Uneven Dinner", type: "CUSTOM_SPLIT" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an Equal Split Pool that also sets organizerShareAmountPaise", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: 100000,
        organizerShareAmountPaise: 100000,
      });
    expect(res.status).toBe(400);
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

describe("PATCH /pools/:poolId/join-code-expiry", () => {
  async function createPool(app: import("express").Express) {
    const res = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Goa Trip", type: "OPEN" });
    return res.body.pool;
  }

  it("sets an expiry on the Pool's join code, measured from now", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);
    const before = Date.now();

    const res = await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ expiryPreset: "24h" });

    expect(res.status).toBe(200);
    const expiresAtMs = new Date(res.body.pool.joinCodeExpiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(expiresAtMs).toBeLessThan(before + 25 * 60 * 60 * 1000);
  });

  it("updates an already-set expiry to a new preset", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);
    await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ expiryPreset: "24h" });

    const res = await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ expiryPreset: "7d" });

    expect(res.status).toBe(200);
    const expiresAtMs = new Date(res.body.pool.joinCodeExpiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it("returns 400 for an invalid preset", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);

    const res = await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ expiryPreset: "9d" });

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);

    const res = await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .set("Authorization", bearerFor("user_someone_else"))
      .send({ expiryPreset: "24h" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .patch("/pools/pool_missing/join-code-expiry")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ expiryPreset: "24h" });

    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = makeApp();
    const pool = await createPool(app);

    const res = await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .send({ expiryPreset: "24h" });

    expect(res.status).toBe(401);
  });
});

describe("Joining rejects an expired join code (ticket #88)", () => {
  const MEMBER_ID = "user_member";

  async function createPoolPastExpiry(app: import("express").Express) {
    const createRes = await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Goa Trip", type: "OPEN" });
    const pool = createRes.body.pool;
    await request(app)
      .patch(`/pools/${pool.id}/join-code-expiry`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ expiryPreset: "24h" });
    return pool;
  }

  it("returns 400 from join-by-code once the code has expired", async () => {
    const { app, poolRepository } = makeApp();
    const pool = await createPoolPastExpiry(app);
    // Fast-forward past the 24h preset directly via the repository, since
    // there's no server-side clock injection to fast-forward instead.
    await poolRepository.updateJoinCodeExpiry(pool.id, new Date(Date.now() - 1000));

    const res = await request(app)
      .post("/pools/join-by-code")
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ code: pool.joinCode });

    expect(res.status).toBe(400);
  });

  it("returns 400 from :poolId/join once the code has expired", async () => {
    const { app, poolRepository } = makeApp();
    const pool = await createPoolPastExpiry(app);
    await poolRepository.updateJoinCodeExpiry(pool.id, new Date(Date.now() - 1000));

    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(400);
  });

  it("succeeds before the expiry passes", async () => {
    const { app } = makeApp();
    const pool = await createPoolPastExpiry(app);

    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
  });
});
