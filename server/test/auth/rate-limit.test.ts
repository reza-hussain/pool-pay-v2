import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { InMemoryOtpStore } from "../../src/auth/fakes/in-memory-otp-store.js";
import { FakeOtpSender } from "../../src/auth/fakes/fake-otp-sender.js";

const PHONE = "+919876543210";
const JWT_SECRET = "test-secret";

function makeApp() {
  const otpSender = new FakeOtpSender();
  const authService = new AuthService({
    userRepository: new InMemoryUserRepository(),
    otpStore: new InMemoryOtpStore(),
    otpSender,
  });
  const app = createApp({ authService, jwtSecret: JWT_SECRET });
  return { app, otpSender };
}

describe("rate limiting", () => {
  it("returns 429 after too many OTP requests for the same client", async () => {
    const { app } = makeApp();

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });

  it("returns 429 after too many OTP verify attempts for the same client", async () => {
    const { app } = makeApp();
    const requestRes = await request(app).post("/auth/otp/request").send({ phoneNumber: PHONE });

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/auth/otp/verify")
        .send({ requestId: requestRes.body.requestId, code: "000000" });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
