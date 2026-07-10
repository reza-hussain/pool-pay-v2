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

  await request(app).post(`/pools/${pool.id}/join`).set("Authorization", bearerFor(MEMBER_ID));
  await request(app)
    .post(`/pools/${pool.id}/deposits`)
    .set("Authorization", bearerFor(MEMBER_ID))
    .send({ amountPaise: 100000 });

  return { app, pool };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("POST /pools/:poolId/reimbursements", () => {
  it("records a Reimbursement to a Member and reports the updated balance, no fee", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ memberId: MEMBER_ID, vpa: "member@upi", amountPaise: 30000 });

    expect(res.status).toBe(201);
    expect(res.body.reimbursement).toMatchObject({
      poolId: pool.id,
      memberId: MEMBER_ID,
      vpa: "member@upi",
      amountPaise: 30000,
    });
    expect(res.body.poolBalancePaise).toBe(100000 - 30000);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ memberId: MEMBER_ID, vpa: "member@upi", amountPaise: 1000 });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a recipient who isn't a Member", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ memberId: "user_stranger", vpa: "stranger@upi", amountPaise: 1000 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the Reimbursement would exceed the Pool's balance", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ memberId: MEMBER_ID, vpa: "member@upi", amountPaise: 100001 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ memberId: MEMBER_ID, vpa: "member@upi", amountPaise: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing UPI ID", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ memberId: MEMBER_ID, amountPaise: 1000 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/pool_missing/reimbursements")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ memberId: MEMBER_ID, vpa: "member@upi", amountPaise: 1000 });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/reimbursements`)
      .send({ memberId: MEMBER_ID, vpa: "member@upi", amountPaise: 1000 });
    expect(res.status).toBe(401);
  });
});
