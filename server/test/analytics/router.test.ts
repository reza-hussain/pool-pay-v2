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
  return { app, userRepository };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("GET /analytics/cross-pool", () => {
  it("returns the aggregate for a subscribed user", async () => {
    const { app, userRepository } = await makeApp();
    await userRepository.subscribe(ORGANIZER_ID);
    await request(app)
      .post("/pools")
      .set("Authorization", bearerFor(ORGANIZER_ID))
      .send({ name: "Goa Trip", type: "OPEN" });

    const res = await request(app)
      .get("/analytics/cross-pool")
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ poolCount: 1, totalSpendPaise: 0, byMerchant: [] });
  });

  it("returns 403 for a non-subscribed user", async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get("/analytics/cross-pool")
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(403);
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = await makeApp();
    const res = await request(app).get("/analytics/cross-pool");
    expect(res.status).toBe(401);
  });
});
