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
import { JoinRequestService } from "../../src/join-requests/join-request-service.js";
import { InMemoryJoinRequestRepository } from "../../src/join-requests/fakes/in-memory-join-request-repository.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";
import { joinAndApprove } from "../support/join-and-approve.js";

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
    joinRequestService,
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
    joinRequestService,
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

  return { app, pool };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

// This Pool is Equal Split (see makeApp above), so joining via Pool Code or
// Invite Link now creates a JoinRequest rather than a Membership (ticket
// #86) — tests that need MEMBER_ID to actually be a Member call
// joinAndApprove instead, which drives the request through to Approved via
// the Organizer-only endpoints.
function approve(app: import("express").Express, poolId: string, requesterId: string) {
  return joinAndApprove(app, poolId, ORGANIZER_ID, requesterId, bearerFor);
}

describe("GET /pools", () => {
  it("lists Pools the caller organizes immediately after creation", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app).get("/pools").set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.pools).toEqual([expect.objectContaining({ id: pool.id })]);
  });

  it("includes a Pool the caller joined as a Member, once approved", async () => {
    const { app, pool } = await makeApp();
    await approve(app, pool.id, MEMBER_ID);

    const res = await request(app).get("/pools").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.body.pools).toEqual([expect.objectContaining({ id: pool.id })]);
  });

  it("excludes a Pool the caller only has a still-pending Join Request for", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));

    const res = await request(app).get("/pools").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.body.pools).toEqual([]);
  });

  it("excludes Pools the caller has no Membership in", async () => {
    const { app } = await makeApp();

    const res = await request(app).get("/pools").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.body.pools).toEqual([]);
  });

  it("excludes a Pool the caller was removed from", async () => {
    const { app, pool } = await makeApp();
    await approve(app, pool.id, MEMBER_ID);
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
  it("creates a pending Join Request instead of joining immediately (Equal Split)", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/join`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("JOIN_REQUEST");
    expect(res.body.joinRequest).toMatchObject({
      poolId: pool.id,
      requesterUserId: MEMBER_ID,
      state: "PENDING",
    });

    const members = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(members.body.members.map((m: { userId: string }) => m.userId)).not.toContain(MEMBER_ID);
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

  it("becomes a Membership only once the Organizer approves the Join Request", async () => {
    const { app, pool } = await makeApp();
    await approve(app, pool.id, MEMBER_ID);

    const res = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.body.members.map((m: { userId: string }) => m.userId)).toContain(MEMBER_ID);
  });
});

describe("POST /pools/join-by-code", () => {
  it("creates a pending Join Request via the Pool's six-digit code (Equal Split)", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post("/pools/join-by-code")
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ code: pool.joinCode });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("JOIN_REQUEST");
    expect(res.body.joinRequest).toMatchObject({
      poolId: pool.id,
      requesterUserId: MEMBER_ID,
      state: "PENDING",
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

  it("includes a Member immediately after their Join Request is approved", async () => {
    const { app, pool } = await makeApp();
    await approve(app, pool.id, MEMBER_ID);

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
      notificationService,
      activityService,
      poolRepository,
      membershipRepository,
      invitationRepository,
    } = makeTestServices({ userRepository });
    membershipRepository.listByPool = async () => {
      throw new Error("database is on fire");
    };
    // This test only exercises GET .../members, which never touches
    // JoinRequestService — a throwaway instance just satisfies the
    // constructor.
    const joinRequestService = new JoinRequestService({
      joinRequestRepository: new InMemoryJoinRequestRepository(),
      membershipRepository,
      poolRepository,
      userRepository,
      notificationService: new NotificationService({ notificationRepository: new InMemoryNotificationRepository() }),
    });
    const membershipService = new MembershipService({
      poolRepository,
      membershipRepository,
      invitationRepository,
      joinRequestService,
    });
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

    const res = await request(app)
      .get(`/pools/${createRes.body.pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(500);
  });
});

describe("DELETE /pools/:poolId/members/:memberId", () => {
  it("removes a Member so they no longer appear in the members list", async () => {
    const { app, pool } = await makeApp();
    await approve(app, pool.id, MEMBER_ID);

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
    await approve(app, pool.id, MEMBER_ID);
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
    await approve(app, pool.id, MEMBER_ID);
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
    await approve(app, pool.id, MEMBER_ID);

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

  it("unlocks joining (as a Join Request, Equal Split) once the Organizer pays their own share", async () => {
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
    expect(res.body.kind).toBe("JOIN_REQUEST");
  });
});
