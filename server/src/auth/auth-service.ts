import { randomInt } from "node:crypto";
import type { IdentityVerificationProvider } from "./identity-provider.js";
import {
  IdentityVerificationFailedError,
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpNotFoundError,
  type OtpSender,
  type OtpStore,
  type User,
  type UserRepository,
} from "./types.js";

// v1 is India-only (ADR 0003) — Indian mobile numbers are 10 digits starting with 6-9.
const INDIAN_PHONE_NUMBER_PATTERN = /^\+91[6-9]\d{9}$/;
const OTP_TTL_MS = 10 * 60 * 1000;

export interface AuthServiceOptions {
  userRepository: UserRepository;
  otpStore: OtpStore;
  otpSender: OtpSender;
  identityProvider: IdentityVerificationProvider;
  now?: () => Date;
  generateCode?: () => string;
}

export interface VerifyOtpResult {
  user: User;
  isNewUser: boolean;
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly otpStore: OtpStore;
  private readonly otpSender: OtpSender;
  private readonly identityProvider: IdentityVerificationProvider;
  private readonly now: () => Date;
  private readonly generateCode: () => string;

  constructor(options: AuthServiceOptions) {
    this.userRepository = options.userRepository;
    this.otpStore = options.otpStore;
    this.otpSender = options.otpSender;
    this.identityProvider = options.identityProvider;
    this.now = options.now ?? (() => new Date());
    this.generateCode = options.generateCode ?? defaultGenerateCode;
  }

  async requestOtp(phoneNumber: string): Promise<{ requestId: string }> {
    if (!INDIAN_PHONE_NUMBER_PATTERN.test(phoneNumber)) {
      throw new InvalidPhoneNumberError(phoneNumber);
    }

    const code = this.generateCode();
    const expiresAt = new Date(this.now().getTime() + OTP_TTL_MS);
    const challenge = await this.otpStore.create(phoneNumber, code, expiresAt);
    await this.otpSender.send(phoneNumber, code);

    return { requestId: challenge.id };
  }

  async verifyOtp(requestId: string, code: string): Promise<VerifyOtpResult> {
    const challenge = await this.otpStore.findById(requestId);
    if (!challenge) {
      throw new OtpNotFoundError();
    }
    if (challenge.consumedAt) {
      throw new OtpAlreadyUsedError();
    }
    if (this.now().getTime() > challenge.expiresAt.getTime()) {
      throw new OtpExpiredError();
    }
    if (challenge.code !== code) {
      throw new InvalidOtpCodeError();
    }

    await this.otpStore.markConsumed(requestId);

    const existingUser = await this.userRepository.findByPhoneNumber(challenge.phoneNumber);
    if (existingUser) {
      return { user: existingUser, isNewUser: false };
    }

    const user = await this.userRepository.create(challenge.phoneNumber);
    return { user, isNewUser: true };
  }

  // Full-KYC (ticket #12, ADR 0007) — delegates to whichever
  // IdentityVerificationProvider is configured. The fake (used until ticket
  // #14's real credentials exist) always passes; the real one actually
  // checks the PAN against Decentro's CKYC registry.
  async verifyIdentity(userId: string, panNumber: string): Promise<User> {
    const result = await this.identityProvider.verifyFullIdentity(userId, panNumber);
    if (!result.verified) {
      throw new IdentityVerificationFailedError();
    }
    return this.userRepository.markFullyVerified(userId);
  }

  // Stubbed freemium subscription (ticket #13, ADR 0011) — passes instantly,
  // no real billing/payment flow yet.
  async subscribe(userId: string): Promise<User> {
    return this.userRepository.subscribe(userId);
  }
}

function defaultGenerateCode(): string {
  return String(randomInt(100000, 1000000));
}
