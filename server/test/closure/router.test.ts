import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { InMemoryOtpStore } from "../../src/auth/fakes/in-memory-otp-store.js";
import { FakeOtpSender } from "../../src/auth/fakes/fake-otp-sender.js";
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

describe("GET /pools/:poolId/close/preview", () => {
  it("returns the refund breakdown without closing the Pool", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .get(`/pools/${pool.id}/close/preview`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.refundTotalPaise).toBe(100000);
    expect(res.body.refunds).toEqual([
      { memberId: MEMBER_ID, contributedPaise: 100000, amountPaise: 100000 },
    ]);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .get(`/pools/${pool.id}/close/preview`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .get("/pools/pool_missing/close/preview")
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(404);
  });
});

describe("POST /pools/:poolId/close", () => {
  it("closes the Pool and refunds each Member pro-rata", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/close`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.pool.state).toBe("CLOSED");
    expect(res.body.refundTotalPaise).toBe(100000);
    expect(res.body.refunds).toHaveLength(1);
    expect(res.body.refunds[0]).toMatchObject({ memberId: MEMBER_ID, amountPaise: 100000 });
  });

  it("returns 400 when closing an already-Closed Pool", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/close`).set("Authorization", bearerFor(ORGANIZER_ID));

    const res = await request(app)
      .post(`/pools/${pool.id}/close`)
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/close`)
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown Pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/pool_missing/close")
      .set("Authorization", bearerFor(ORGANIZER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app).post(`/pools/${pool.id}/close`);
    expect(res.status).toBe(401);
  });

  it("a Closed Pool no longer accepts deposits or Spends", async () => {
    const { app, pool } = await makeApp();
    await request(app).post(`/pools/${pool.id}/close`).set("Authorization", bearerFor(ORGANIZER_ID));

    const depositRes = await request(app)
      .post(`/pools/${pool.id}/deposits`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ amountPaise: 1000 });
    expect(depositRes.status).toBe(400);

    const spendRes = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 1000 });
    expect(spendRes.status).toBe(400);
  });
});
