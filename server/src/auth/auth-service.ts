import { randomInt } from "node:crypto";
import type { IdentityVerificationProvider } from "./identity-provider.js";
import type { PaymentProvider, VpaVerificationResult } from "../payments/types.js";
import { FakePaymentProvider } from "../payments/fakes/fake-payment-provider.js";
import {
  IdentityVerificationFailedError,
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  OtpAlreadyUsedError,
  OtpExpiredError,
  OtpNotFoundError,
  ProfileIncompleteError,
  UnderageError,
  type CompleteProfileInput,
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
  // Optional (defaults to the fake) so the many existing callers that don't
  // care about UPI ID verification don't all need updating — only
  // src/index.ts needs to pass the real Cashfree-backed one explicitly.
  paymentProvider?: PaymentProvider;
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
  private readonly paymentProvider: PaymentProvider;
  private readonly now: () => Date;
  private readonly generateCode: () => string;

  constructor(options: AuthServiceOptions) {
    this.userRepository = options.userRepository;
    this.otpStore = options.otpStore;
    this.otpSender = options.otpSender;
    this.identityProvider = options.identityProvider;
    this.paymentProvider = options.paymentProvider ?? new FakePaymentProvider();
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
  // IdentityVerificationProvider is configured. The fake (used until real
  // credentials exist) always passes; the real one actually checks the PAN
  // against Cashfree's PAN-registry verification, including a name-match
  // against the person's own on-file profile name (ADR 0013). Requires
  // Onboarding's profile step (ADR 0012) to have already run — otherwise
  // there's no name on file to check the PAN against, which would silently
  // make the name-match check meaningless.
  async verifyIdentity(userId: string, panNumber: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user?.name) {
      throw new ProfileIncompleteError();
    }
    const result = await this.identityProvider.verifyFullIdentity(userId, panNumber, user.name);
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

  // Verifies a Registered UPI ID is real before Onboarding accepts it (ADR
  // 0012) — delegates to whichever PaymentProvider is configured. Doesn't
  // persist anything; ProfileSetupScreen calls this once per UPI ID the
  // person types before letting them submit it via completeProfile.
  async verifyUpiId(vpa: string): Promise<VpaVerificationResult> {
    return this.paymentProvider.verifyVpa(vpa);
  }

  // Onboarding's profile-setup step (CONTEXT.md, ADR 0012) — mandatory,
  // one-time, blocks reaching Home. Field shape/required-ness is validated
  // at the router; the age gate is domain logic so it lives here.
  async completeProfile(userId: string, input: CompleteProfileInput): Promise<User> {
    if (ageInYears(input.dateOfBirth, this.now()) < 18) {
      throw new UnderageError();
    }
    return this.userRepository.completeProfile(userId, input);
  }
}

function ageInYears(dateOfBirth: Date, now: Date): number {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hasNotHadBirthdayYetThisYear =
    now.getMonth() < dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() < dateOfBirth.getDate());
  if (hasNotHadBirthdayYetThisYear) {
    age -= 1;
  }
  return age;
}

function defaultGenerateCode(): string {
  return String(randomInt(100000, 1000000));
}
