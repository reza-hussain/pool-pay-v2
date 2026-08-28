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

function makeApp() {
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
    spendApprovalService,
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
    spendApprovalService,
    reimbursementService,
    ledgerService,
    closureService,
    voteService,
    analyticsService,
    notificationService,
    activityService,
    jwtSecret: JWT_SECRET,
  });
  return { app, notificationService };
}

function bearerFor(userId: string) {
  return `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;
}

describe("GET /notifications", () => {
  it("returns the caller's notifications, newest first", async () => {
    const { app, notificationService } = makeApp();
    await notificationService.notify({
      recipientUserIds: [MEMBER_ID],
      poolId: "pool_1",
      type: "POOL_LOCKED",
      message: "Goa Trip was locked",
    });

    const res = await request(app).get("/notifications").set("Authorization", bearerFor(MEMBER_ID));

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      poolId: "pool_1",
      type: "POOL_LOCKED",
      message: "Goa Trip was locked",
      readAt: null,
    });
  });

  it("returns an empty list for a user with no notifications", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .get("/notifications")
      .set("Authorization", bearerFor(ORGANIZER_ID));

    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/notifications");
    expect(res.status).toBe(401);
  });
});

describe("POST /notifications/mark-all-read", () => {
  it("marks every one of the caller's unread notifications as read", async () => {
    const { app, notificationService } = makeApp();
    await notificationService.notify({
      recipientUserIds: [MEMBER_ID],
      poolId: "pool_1",
      type: "POOL_LOCKED",
      message: "Goa Trip was locked",
    });

    const markRes = await request(app)
      .post("/notifications/mark-all-read")
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(markRes.status).toBe(204);

    const listRes = await request(app)
      .get("/notifications")
      .set("Authorization", bearerFor(MEMBER_ID));
    expect(listRes.body.notifications[0].readAt).not.toBeNull();
  });

  it("returns 401 without a bearer token", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/notifications/mark-all-read");
    expect(res.status).toBe(401);
  });
});
