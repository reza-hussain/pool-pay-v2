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
  const pool = createRes.body.pool as { id: string; joinCode: string };

  // Pay the Organizer's own share so the Pool is unlocked for Add Members —
  // this file exercises join/member-list/remove mechanics, not the payment
  // gate itself (ADR-0017; see the dedicated describe block below for that).
  const intentRes = await request(app)
    .get(`/pools/${pool.id}/deposit-intent`)
    .set("Authorization", bearerFor(ORGANIZER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(ORGANIZER_ID))
    .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 100000 });

  return { app, pool, userRepository };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

function seedUpi(userRepository: InMemoryUserRepository, userId: string) {
  userRepository.seedVerifiedUser(userId, undefined, { upiId: `${userId}@upi` });
}

describe("GET /pools", () => {
  it("lists Pools the caller organizes immediately after creation", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app).get("/pools").set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.pools).toEqual([expect.objectContaining({ id: pool.id })]);
  });

  it("includes a Pool the caller joined as a Member", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app).get("/pools").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.body.pools).toEqual([expect.objectContaining({ id: pool.id })]);
  });

  it("excludes Pools the caller has no Membership in", async () => {
    const { app } = await makeApp();

    const res = await request(app).get("/pools").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.body.pools).toEqual([]);
  });

  it("excludes a Pool the caller was removed from", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
    await request(app)
      .delete(`/pools/${pool.id}/members/${MEMBER_ID}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app).get("/pools").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.body.pools).toEqual([]);
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = await makeApp();
    const res = await request(app).get("/pools");
    expect(res.status).toBe(401);
  });
});

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
      spendApprovalService,
      reimbursementService,
      ledgerService,
      closureService,
      voteService,
      analyticsService,
      notificationService,
      activityService,
      poolRepository,
      membershipRepository,
      invitationRepository,
      depositRepository,
      spendRepository,
      spendAttributionRepository,
      reimbursementRepository,
      refundRepository,
      paymentProvider,
    } = makeTestServices({ userRepository });
    membershipRepository.listByPool = async () => {
      throw new Error("database is on fire");
    };
    const membershipService = new MembershipService({
      poolRepository,
      membershipRepository,
      invitationRepository,
      depositRepository,
      spendRepository,
      spendAttributionRepository,
      reimbursementRepository,
      refundRepository,
      userRepository,
      paymentProvider,
    });
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

describe("GET /pools/:poolId/members/:memberId/departure/preview", () => {
  it("returns the computed default refund with no side effects", async () => {
    const { app, pool, userRepository } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
    seedUpi(userRepository, MEMBER_ID);
    const intentRes = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));
    await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 50000 });

    const res = await request(app)
      .get(`/pools/${pool.id}/members/${MEMBER_ID}/departure/preview`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.amountPaise).toBe(50000);

    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members.map((m: { userId: string }) => m.userId)).toContain(MEMBER_ID);
  });

  it("returns 403 for a non-Organizer caller", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .get(`/pools/${pool.id}/members/${MEMBER_ID}/departure/preview`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 400 for previewing the Organizer themselves", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/members/${ORGANIZER_ID}/departure/preview`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(400);
  });
});

describe("POST /pools/:poolId/leave", () => {
  it("lets a Member leave, paying out their remaining balance", async () => {
    const { app, pool, userRepository } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
    seedUpi(userRepository, MEMBER_ID);
    const intentRes = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(MEMBER_ID));
    await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 20000 });

    const res = await request(app)
      .post(`/pools/${pool.id}/leave`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.refund).toMatchObject({ memberId: MEMBER_ID, amountPaise: 20000 });

    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members.map((m: { userId: string }) => m.userId)).not.toContain(
      MEMBER_ID,
    );
  });

  it("blocks the Organizer from leaving", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/leave`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(400);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).post(`/pools/${pool.id}/leave`);
    expect(res.status).toBe(401);
  });
});

describe("POST /pools/:poolId/organizer (Organizer Transfer)", () => {
  it("transfers the Organizer role to another active Member", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .post(`/pools/${pool.id}/organizer`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ newOrganizerUserId: MEMBER_ID });

    expect(res.status).toBe(200);
    expect(res.body.pool.organizerId).toBe(MEMBER_ID);

    // The former Organizer is now an ordinary Member — Locking is
    // lifecycle authority, and should now belong to the new Organizer only.
    const lockRes = await request(app)
      .post(`/pools/${pool.id}/lock`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(lockRes.status).toBe(403);
  });

  it("returns 403 for a non-Organizer caller", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app)
      .post(`/pools/${pool.id}/organizer`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ newOrganizerUserId: MEMBER_ID });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the target is already the Organizer", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/organizer`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ newOrganizerUserId: ORGANIZER_ID });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a target who isn't an active Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/organizer`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ newOrganizerUserId: "user_stranger" });
    expect(res.status).toBe(404);
  });
});

describe("Awaiting Payment gate (ADR-0017)", () => {
  async function makeUnpaidApp() {
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

    return { app, pool: createRes.body.pool as { id: string; joinCode: string } };
  }

  it("POST /pools/:poolId/join returns 400 while the Organizer hasn't paid", async () => {
    const { app, pool } = await makeUnpaidApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(400);
  });

  it("POST /pools/join-by-code returns 400 while the Organizer hasn't paid", async () => {
    const { app, pool } = await makeUnpaidApp();

    const res = await request(app)
      .post("/pools/join-by-code")
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ code: pool.joinCode });

    expect(res.status).toBe(400);
  });

  it("GET /pools still includes the unpaid Pool for its Organizer", async () => {
    const { app, pool } = await makeUnpaidApp();

    const res = await request(app).get("/pools").set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.body.pools.map((p: { id: string }) => p.id)).toContain(pool.id);
  });

  it("unlocks joining once the Organizer pays their own share", async () => {
    const { app, pool } = await makeUnpaidApp();
    const intentRes = await request(app)
      .get(`/pools/${pool.id}/deposit-intent`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ depositIntentId: intentRes.body.intent.id, amountPaise: 100000 });

    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
  });
});
