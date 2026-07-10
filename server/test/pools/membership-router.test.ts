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
import { MembershipService } from "../../src/memberships/membership-service.js";

const JWT_SECRET = "test-secret";
const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

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

  return { app, pool: createRes.body.pool as { id: string; joinCode: string } };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("POST /pools/:poolId/join", () => {
  it("joins the authenticated user to the Pool as a Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.membership).toMatchObject({
      poolId: pool.id,
      userId: MEMBER_ID,
      role: "MEMBER",
    });
  });

  it("returns 404 for an unknown Pool id", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/does-not-exist/join")
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).post(`/pools/${pool.id}/join`);
    expect(res.status).toBe(401);
  });

  it("does not require Organizer approval — joining just works", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(200);
  });
});

describe("POST /pools/join-by-code", () => {
  it("joins the authenticated user via the Pool's six-digit code", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post("/pools/join-by-code")
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ code: pool.joinCode });

    expect(res.status).toBe(200);
    expect(res.body.membership).toMatchObject({
      poolId: pool.id,
      userId: MEMBER_ID,
      role: "MEMBER",
    });
  });

  it("returns 400 for an unknown code", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/join-by-code")
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ code: "000000" });
    expect(res.status).toBe(400);
  });
});

describe("GET /pools/:poolId/members", () => {
  it("lists the Organizer immediately after Pool creation", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      expect.objectContaining({ userId: ORGANIZER_ID, role: "ORGANIZER" }),
    ]);
  });

  it("includes a Member immediately after they join", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const userIds = res.body.members.map((m: { userId: string }) => m.userId).sort();
    expect(userIds).toEqual([MEMBER_ID, ORGANIZER_ID].sort());
  });

  it("returns 500 instead of hanging when a dependency throws unexpectedly", async () => {
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
      depositService,
      spendService,
      reimbursementService,
      ledgerService,
      closureService,
      voteService,
      analyticsService,
      poolRepository,
      membershipRepository,
    } = makeTestServices({ userRepository });
    membershipRepository.listByPool = async () => {
      throw new Error("database is on fire");
    };
    const membershipService = new MembershipService({ poolRepository, membershipRepository });
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

    const res = await request(app)
      .get(`/pools/${createRes.body.pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(500);
  });
});

describe("DELETE /pools/:poolId/members/:memberId", () => {
  it("removes a Member so they no longer appear in the members list", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .delete(`/pools/${pool.id}/members/${MEMBER_ID}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(204);

    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members.map((m: { userId: string }) => m.userId)).not.toContain(
      MEMBER_ID,
    );
  });

  it("blocks a removed Member from depositing", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
    await request(app)
      .delete(`/pools/${pool.id}/members/${MEMBER_ID}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const intentRes = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));
    const res = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 1000 });
    expect(res.status).toBe(403);
  });

  it("blocks a removed Member from viewing the ledger", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
    await request(app)
      .delete(`/pools/${pool.id}/members/${MEMBER_ID}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app)
      .get(`/pools/${pool.id}/ledger`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .delete(`/pools/${pool.id}/members/${MEMBER_ID}`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 400 for the Organizer removing themselves", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .delete(`/pools/${pool.id}/members/${ORGANIZER_ID}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(400);
  });

  it("returns 404 for someone who isn't a Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .delete(`/pools/${pool.id}/members/user_stranger`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .delete("/pools/pool_missing/members/user_x")
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).delete(`/pools/${pool.id}/members/${MEMBER_ID}`);
    expect(res.status).toBe(401);
  });
});
