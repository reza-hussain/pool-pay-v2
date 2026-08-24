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
const INVITEE_ID = "user_invitee";
const INVITEE_PHONE = "+919876500001";

function makeApp() {
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID, "+919876500000", { name: "Rhea" });
  userRepository.seedVerifiedUser(INVITEE_ID, INVITEE_PHONE, { name: "Dev" });
  const authService = new AuthService({
    userRepository,
    otpStore: new InMemoryOtpStore(),
    otpSender: new FakeOtpSender(),
    identityProvider: new FakeIdentityProvider(),
  });
  const {
    poolService,
    membershipService,
    invitationService,
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
  } = makeTestServices({ userRepository });
  const app = createApp({
    authService,
    poolService,
    membershipService,
    invitationService,
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
  return { app, poolRepository, membershipRepository };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

async function makeCustomSplitPool(poolRepository: ReturnType<typeof makeApp>["poolRepository"]) {
  return poolRepository.create(ORGANIZER_ID, {
    name: "Munnar Trip",
    type: "CUSTOM_SPLIT",
    perPersonAmountPaise: null,
    joinCode: "555555",
  });
}

describe("POST /pools/:poolId/invitations", () => {
  it("sends an Invitation for the Organizer's own paid Custom Split Pool", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({
      poolId: pool.id,
      inviteeUserId: INVITEE_ID,
      assignedAmountPaise: 250000,
      state: "PENDING",
    });
  });

  it("404s inviting an unregistered phone number", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: "+919999999999", assignedAmountPaise: 250000 });

    expect(res.status).toBe(404);
  });

  it("403s a non-Organizer sender", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(INVITEE_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    expect(res.status).toBe(403);
  });

  it("403s an Organizer who hasn't paid their own share yet", async () => {
    const { app, poolRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    expect(res.status).toBe(403);
  });

  it("400s on a non-Custom-Split Pool", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await poolRepository.create(ORGANIZER_ID, {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "666666",
    });
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    expect(res.status).toBe(400);
  });

  it("400s a missing body", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("GET /pools/:poolId/invitations", () => {
  it("lists every Invitation sent for the Pool", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    const res = await request(app)
      .get(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0]).toMatchObject({
      inviteeName: "Dev",
      inviteePhoneNumber: INVITEE_PHONE,
    });
  });

  it("403s a non-Organizer requester", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .get(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(INVITEE_ID));

    expect(res.status).toBe(403);
  });
});

describe("POST /pools/:poolId/invitations expiryPreset", () => {
  it("sends an Invitation with the given expiry preset", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000, expiryPreset: "24h" });

    expect(res.status).toBe(201);
    const sentAt = Date.now();
    const expiresAt = new Date(res.body.invitation.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(sentAt);
    expect(expiresAt).toBeLessThan(sentAt + 25 * 60 * 60 * 1000);
  });

  it("400s an invalid expiry preset", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000, expiryPreset: "9d" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /pools/:poolId/invitations/:invitationId", () => {
  it("cancels a pending Invitation", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    const sendRes = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    const res = await request(app)
      .delete(`/pools/${pool.id}/invitations/${sendRes.body.invitation.id}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(204);

    const listRes = await request(app)
      .get(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(listRes.body.invitations[0].invitation.state).toBe("CANCELLED");
  });

  it("403s a non-Organizer requester", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    const sendRes = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    const res = await request(app)
      .delete(`/pools/${pool.id}/invitations/${sendRes.body.invitation.id}`)
      .set("Authorization", bearerFor(INVITEE_ID));

    expect(res.status).toBe(403);
  });

  it("404s an unknown invitation id", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

    const res = await request(app)
      .delete(`/pools/${pool.id}/invitations/does-not-exist`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(404);
  });

  it("404s an unknown pool", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .delete("/pools/pool_missing/invitations/invitation_x")
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(404);
  });

  it("400s cancelling an already-paid Invitation", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    const sendRes = await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });
    await request(app)
      .delete(`/pools/${pool.id}/invitations/${sendRes.body.invitation.id}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app)
      .delete(`/pools/${pool.id}/invitations/${sendRes.body.invitation.id}`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(400);
  });
});

describe("GET /invitations/mine", () => {
  it("lists the invitee's pending Invitations across Pools", async () => {
    const { app, poolRepository, membershipRepository } = makeApp();
    const pool = await makeCustomSplitPool(poolRepository);
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    await request(app)
      .post(`/pools/${pool.id}/invitations`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ phoneNumber: INVITEE_PHONE, assignedAmountPaise: 250000 });

    const res = await request(app)
      .get("/invitations/mine")
      .set("Authorization", bearerFor(INVITEE_ID));

    expect(res.status).toBe(200);
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0].invitation).toMatchObject({ assignedAmountPaise: 250000 });
    expect(res.body.invitations[0].pool).toMatchObject({ name: "Munnar Trip" });
    expect(res.body.invitations[0].organizerName).toBe("Rhea");
  });

  it("returns an empty list for a user with no Invitations", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .get("/invitations/mine")
      .set("Authorization", bearerFor(INVITEE_ID));

    expect(res.status).toBe(200);
    expect(res.body.invitations).toEqual([]);
  });
});
