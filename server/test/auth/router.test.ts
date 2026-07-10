import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { InMemoryOtpStore } from "../../src/auth/fakes/in-memory-otp-store.js";
import { FakeOtpSender } from "../../src/auth/fakes/fake-otp-sender.js";
import { makeTestServices } from "../support/make-test-services.js";

const PHONE = "+919876543210";
const JWT_SECRET = "test-secret";

function makeApp() {
  const otpSender = new FakeOtpSender();
  const authService = new AuthService({
    userRepository: new InMemoryUserRepository(),
    otpStore: new InMemoryOtpStore(),
    otpSender,
  });
  const {
    poolService,
    membershipService,
    depositService,
    spendService,
    reimbursementService,
    ledgerService,
    closureService,
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
    jwtSecret: JWT_SECRET,
  });
  return { app, otpSender };
}

describe("error handling", () => {
  it("returns 500 instead of hanging when a dependency throws unexpectedly", async () => {
    const otpSender = new FakeOtpSender();
    const brokenUserRepository = new InMemoryUserRepository();
    brokenUserRepository.findByPhoneNumber = async () => {
      throw new Error("database is on fire");
    };
    const authService = new AuthService({
      userRepository: brokenUserRepository,
      otpStore: new InMemoryOtpStore(),
      otpSender,
    });
    const {
      poolService,
      membershipService,
      depositService,
      spendService,
      reimbursementService,
      ledgerService,
      closureService,
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
      jwtSecret: JWT_SECRET,
    });

    const requestRes = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });
    const res = await request(app)
      .post("/auth/otp/verify")
      .send({ requestId: requestRes.body.requestId, code: otpSender.lastCodeSentTo(PHONE)! });

    expect(res.status).toBe(500);
  });
});

describe("POST /auth/otp/request", () => {
  it("returns a requestId for a valid phone number", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBeTruthy();
  });

  it("returns 400 for an invalid phone number", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/auth/otp/request")
      .send({ phoneNumber: "not-a-phone" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when phoneNumber is missing", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/auth/otp/request").send({});

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/otp/verify", () => {
  it("signs up a new user and returns a session token", async () => {
    const { app, otpSender } = makeApp();
    const requestRes = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });
    const code = otpSender.lastCodeSentTo(PHONE)!;

    const verifyRes = await request(app)
      .post("/auth/otp/verify")
      .send({ requestId: requestRes.body.requestId, code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.isNewUser).toBe(true);
    expect(verifyRes.body.user.phoneNumber).toBe(PHONE);
    expect(typeof verifyRes.body.token).toBe("string");
  });

  it("logs in an existing user on a second verification", async () => {
    const { app, otpSender } = makeApp();
    const first = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });
    await request(app)
      .post("/auth/otp/verify")
      .send({ requestId: first.body.requestId, code: otpSender.lastCodeSentTo(PHONE)! });

    const second = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });
    const loginRes = await request(app)
      .post("/auth/otp/verify")
      .send({ requestId: second.body.requestId, code: otpSender.lastCodeSentTo(PHONE)! });

    expect(loginRes.body.isNewUser).toBe(false);
  });

  it("returns 404 for an unknown requestId", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/auth/otp/verify")
      .send({ requestId: "does-not-exist", code: "123456" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for the wrong code", async () => {
    const { app } = makeApp();
    const requestRes = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });

    const res = await request(app)
      .post("/auth/otp/verify")
      .send({ requestId: requestRes.body.requestId, code: "000000" });

    expect(res.status).toBe(400);
  });
});
