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

function makeApp() {
  const authService = new AuthService({
    userRepository: new InMemoryUserRepository(),
    otpStore: new InMemoryOtpStore(),
    otpSender: new FakeOtpSender(),
  });
  const { poolService, membershipService, depositService, poolRepository } = makeTestServices();
  const app = createApp({
    authService,
    poolService,
    membershipService,
    depositService,
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
});
