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
  const authService = new AuthService({
    userRepository: new InMemoryUserRepository(),
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
  } = makeTestServices();
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

describe("POST /pools/:poolId/spends", () => {
  it("records a Spend for the Organizer and reports the updated balance", async () => {
    const { app, pool } = await makeApp();

    const res = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 50000 });

    expect(res.status).toBe(201);
    expect(res.body.spend).toMatchObject({
      poolId: pool.id,
      userId: ORGANIZER_ID,
      merchantRef: "merchant@upi",
      amountPaise: 50000,
      feePaise: 500,
    });
    expect(res.body.poolBalancePaise).toBe(100000 - 50000 - 500);
  });

  it("returns 403 for a non-Organizer", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(MEMBER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 50000 });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the Spend would exceed the Pool's balance", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 100000 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing merchant reference", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ amountPaise: 1000 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown pool", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/pools/pool_missing/spends")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ merchantRef: "merchant@upi", amountPaise: 1000 });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a bearer token", async () => {
    const { app, pool } = await makeApp();
    const res = await request(app)
      .post(`/pools/${pool.id}/spends`)
      .send({ merchantRef: "merchant@upi", amountPaise: 1000 });
    expect(res.status).toBe(401);
  });
});
