import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth-service.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { InMemoryOtpStore } from "../../src/auth/fakes/in-memory-otp-store.js";
import { FakeOtpSender } from "../../src/auth/fakes/fake-otp-sender.js";
import {
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpNotFoundError,
} from "../../src/auth/types.js";

const PHONE = "+919876543210";

function makeAuthService(now = () => new Date("2026-07-09T00:00:00.000Z")) {
  const userRepository = new InMemoryUserRepository();
  const otpStore = new InMemoryOtpStore();
  const otpSender = new FakeOtpSender();
  const authService = new AuthService({ userRepository, otpStore, otpSender, now });
  return { authService, userRepository, otpStore, otpSender };
}

describe("AuthService.requestOtp", () => {
  it("rejects an invalid phone number", async () => {
    const { authService } = makeAuthService();
    await expect(authService.requestOtp("not-a-phone-number")).rejects.toThrow(
      InvalidPhoneNumberError,
    );
  });

  it("rejects a non-Indian phone number (v1 is India-only, ADR 0003)", async () => {
    const { authService } = makeAuthService();
    await expect(authService.requestOtp("+14155552671")).rejects.toThrow(
      InvalidPhoneNumberError,
    );
  });

  it("sends a 6-digit code to the phone number and returns a request id", async () => {
    const { authService, otpSender } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);

    expect(requestId).toBeTruthy();
    const code = otpSender.lastCodeSentTo(PHONE);
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe("AuthService.verifyOtp", () => {
  it("creates a new user on first successful verification (signup)", async () => {
    const { authService, otpSender, userRepository } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);
    const code = otpSender.lastCodeSentTo(PHONE)!;

    const result = await authService.verifyOtp(requestId, code);

    expect(result.isNewUser).toBe(true);
    expect(result.user.phoneNumber).toBe(PHONE);
    await expect(userRepository.findByPhoneNumber(PHONE)).resolves.toMatchObject({
      phoneNumber: PHONE,
    });
  });

  it("returns the existing user on a later login, without creating a duplicate", async () => {
    const { authService, otpSender } = makeAuthService();

    const first = await authService.requestOtp(PHONE);
    const firstCode = otpSender.lastCodeSentTo(PHONE)!;
    const signup = await authService.verifyOtp(first.requestId, firstCode);

    const second = await authService.requestOtp(PHONE);
    const secondCode = otpSender.lastCodeSentTo(PHONE)!;
    const login = await authService.verifyOtp(second.requestId, secondCode);

    expect(login.isNewUser).toBe(false);
    expect(login.user.id).toBe(signup.user.id);
  });

  it("gives every user a stable, unique id", async () => {
    const { authService, otpSender } = makeAuthService();

    const a = await authService.requestOtp(PHONE);
    const aResult = await authService.verifyOtp(a.requestId, otpSender.lastCodeSentTo(PHONE)!);

    const otherPhone = "+919876500000";
    const b = await authService.requestOtp(otherPhone);
    const bResult = await authService.verifyOtp(
      b.requestId,
      otpSender.lastCodeSentTo(otherPhone)!,
    );

    expect(aResult.user.id).not.toBe(bResult.user.id);
  });

  it("rejects an unknown request id", async () => {
    const { authService } = makeAuthService();
    await expect(authService.verifyOtp("does-not-exist", "123456")).rejects.toThrow(
      OtpNotFoundError,
    );
  });

  it("rejects the wrong code", async () => {
    const { authService } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);

    await expect(authService.verifyOtp(requestId, "000000")).rejects.toThrow(
      InvalidOtpCodeError,
    );
  });

  it("rejects a code that has already been used", async () => {
    const { authService, otpSender } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);
    const code = otpSender.lastCodeSentTo(PHONE)!;

    await authService.verifyOtp(requestId, code);

    await expect(authService.verifyOtp(requestId, code)).rejects.toThrow(OtpAlreadyUsedError);
  });

  it("rejects an expired code", async () => {
    let currentTime = new Date("2026-07-09T00:00:00.000Z");
    const { authService, otpSender } = makeAuthService(() => currentTime);
    const { requestId } = await authService.requestOtp(PHONE);
    const code = otpSender.lastCodeSentTo(PHONE)!;

    currentTime = new Date("2026-07-09T00:10:01.000Z"); // 10 minutes + 1s later

    await expect(authService.verifyOtp(requestId, code)).rejects.toThrow(OtpExpiredError);
  });

  it("signs up a new user as not yet fully verified (ticket #12)", async () => {
    const { authService, otpSender } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);
    const code = otpSender.lastCodeSentTo(PHONE)!;

    const result = await authService.verifyOtp(requestId, code);

    expect(result.user.isVerified).toBe(false);
  });
});

describe("AuthService.verifyIdentity", () => {
  it("marks the user as fully verified (stubbed full-KYC, ticket #12)", async () => {
    const { authService, otpSender } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);
    const code = otpSender.lastCodeSentTo(PHONE)!;
    const { user } = await authService.verifyOtp(requestId, code);
    expect(user.isVerified).toBe(false);

    const verified = await authService.verifyIdentity(user.id);

    expect(verified.isVerified).toBe(true);
  });
});

describe("AuthService.subscribe", () => {
  it("marks the user as subscribed (stubbed billing, ticket #13)", async () => {
    const { authService, otpSender } = makeAuthService();
    const { requestId } = await authService.requestOtp(PHONE);
    const code = otpSender.lastCodeSentTo(PHONE)!;
    const { user } = await authService.verifyOtp(requestId, code);
    expect(user.isSubscribed).toBe(false);

    const subscribed = await authService.subscribe(user.id);

    expect(subscribed.isSubscribed).toBe(true);
  });
});
