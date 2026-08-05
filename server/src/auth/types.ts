export interface User {
  id: string;
  phoneNumber: string;
  createdAt: Date;
  isVerified: boolean;
  isSubscribed: boolean;
  // Onboarding (CONTEXT.md, ADR 0012) — all null/false until completeProfile.
  name: string | null;
  email: string | null;
  dateOfBirth: Date | null;
  // Registered UPI ID — the real refund/reimbursement destination.
  upiId: string | null;
  avatarUrl: string | null;
  isOnboarded: boolean;
}

export interface CompleteProfileInput {
  name: string;
  email: string;
  dateOfBirth: Date;
  upiId: string;
  avatarUrl: string | null;
}

export interface UserRepository {
  findByPhoneNumber(phoneNumber: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(phoneNumber: string): Promise<User>;
  markFullyVerified(id: string): Promise<User>;
  subscribe(id: string): Promise<User>;
  completeProfile(id: string, profile: CompleteProfileInput): Promise<User>;
}

export interface OtpChallenge {
  id: string;
  phoneNumber: string;
  code: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface OtpStore {
  create(phoneNumber: string, code: string, expiresAt: Date): Promise<OtpChallenge>;
  findById(id: string): Promise<OtpChallenge | null>;
  markConsumed(id: string): Promise<void>;
}

export interface OtpSender {
  send(phoneNumber: string, code: string): Promise<void>;
}

export class InvalidPhoneNumberError extends Error {
  constructor(phoneNumber: string) {
    super(`Invalid phone number: ${phoneNumber}`);
    this.name = "InvalidPhoneNumberError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export class OtpNotFoundError extends Error {
  constructor() {
    super("OTP request not found");
    this.name = "OtpNotFoundError";
  }
}

export class OtpAlreadyUsedError extends Error {
  constructor() {
    super("OTP has already been used");
    this.name = "OtpAlreadyUsedError";
  }
}

export class OtpExpiredError extends Error {
  constructor() {
    super("OTP has expired");
    this.name = "OtpExpiredError";
  }
}

export class InvalidOtpCodeError extends Error {
  constructor() {
    super("Incorrect OTP code");
    this.name = "InvalidOtpCodeError";
  }
}

export class IdentityVerificationFailedError extends Error {
  constructor() {
    super("Identity verification did not succeed");
    this.name = "IdentityVerificationFailedError";
  }
}

// Full-KYC (ADR 0007) now checks the PAN's registered name against the
// person's on-file profile name (ADR 0012's Onboarding), so there's nothing
// to check it against until Onboarding's profile step has run.
export class ProfileIncompleteError extends Error {
  constructor() {
    super("Complete your profile before verifying your identity");
    this.name = "ProfileIncompleteError";
  }
}

// Universal 18+ age gate at Onboarding (ADR 0012) — applies to every person
// regardless of role, separate from the Organizer-only full KYC tier (ADR 0007).
export class UnderageError extends Error {
  constructor() {
    super("You must be at least 18 years old to use Pool Pay");
    this.name = "UnderageError";
  }
}
