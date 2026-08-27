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
const REQUESTER_ID = "user_requester";

async function makeApp() {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  userRepository.seedVerifiedUser(MEMBER_ID);
  userRepository.seedVerifiedUser(REQUESTER_ID, undefined, { name: "Dev" });
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

describe("GET /pools/:poolId/join-requests", () => {
  it("lists the Pool's pending Join Requests for the Organizer", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));

    const res = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.joinRequests).toHaveLength(1);
    expect(res.body.joinRequests[0]).toMatchObject({
      requesterName: "Dev",
    });
    expect(res.body.joinRequests[0].joinRequest).toMatchObject({
      poolId: pool.id,
      requesterUserId: REQUESTER_ID,
      state: "PENDING",
    });
  });

  it("is hidden from a non-Organizer Member", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/pools/does-not-exist/join-requests")
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(404);
  });
});

describe("POST /pools/:poolId/join-requests/:joinRequestId/approve", () => {
  it("approves the request, creating a Membership for the requester", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));
    const pending = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    const joinRequestId = pending.body.joinRequests[0].joinRequest.id;

    const res = await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/approve`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.joinRequest.state).toBe("APPROVED");

    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members.map((m: { userId: string }) => m.userId)).toContain(REQUESTER_ID);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));
    const pending = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    const joinRequestId = pending.body.joinRequests[0].joinRequest.id;

    const res = await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/approve`)
      .set("Authorization", bearerFor(REQUESTER_ID));

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Join Request id", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/join-requests/does-not-exist/approve`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(404);
  });

  it("returns 400 when the request was already decided", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));
    const pending = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    const joinRequestId = pending.body.joinRequests[0].joinRequest.id;
    await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/approve`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/approve`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(400);
  });
});

describe("POST /pools/:poolId/join-requests/:joinRequestId/decline", () => {
  it("declines the request, no Membership created", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));
    const pending = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    const joinRequestId = pending.body.joinRequests[0].joinRequest.id;

    const res = await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/decline`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.joinRequest.state).toBe("REJECTED");

    const membersRes = await request(app)
      .get(`/pools/${pool.id}/members`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(membersRes.body.members.map((m: { userId: string }) => m.userId)).not.toContain(REQUESTER_ID);
  });

  it("blocks an immediate re-request via the same Pool Code", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));
    const pending = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    const joinRequestId = pending.body.joinRequests[0].joinRequest.id;
    await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/decline`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app)
      .post("/pools/join-by-code")
      .set("Authorization", bearerFor(REQUESTER_ID))
      .send({ code: pool.joinCode });

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(REQUESTER_ID));
    const pending = await request(app)
      .get(`/pools/${pool.id}/join-requests`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    const joinRequestId = pending.body.joinRequests[0].joinRequest.id;

    const res = await request(app)
      .post(`/pools/${pool.id}/join-requests/${joinRequestId}/decline`)
      .set("Authorization", bearerFor(REQUESTER_ID));

    expect(res.status).toBe(403);
  });
});
