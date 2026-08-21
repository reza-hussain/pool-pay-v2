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

// UPI ownership proof-of-control for Onboarding's Registered UPI ID (ticket
// #38, ADR 0014) — Cashfree has no API to check phone/VPA linkage directly,
// so a real ~₹1 UPI collect request stands in as real-world proof the person
// controls the VPA they typed. PENDING until the webhook confirms or the
// check times out; scoped to the exact (userId, upiId) pair it was raised
// for — editing the typed UPI ID afterward means there's no longer a
// confirmed row for the new text.
export type UpiOwnershipConfirmationStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface UpiOwnershipConfirmation {
  id: string;
  userId: string;
  upiId: string;
  providerRef: string;
  status: UpiOwnershipConfirmationStatus;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface UpiOwnershipConfirmationRepository {
  // createdAt is supplied by the caller (AuthService's injected clock,
  // matching OtpStore.create's expiresAt) rather than stamped by the
  // repository itself, so the ~2 min timeout check in
  // AuthService.getUpiOwnershipStatus is testable against a fake clock.
  create(userId: string, upiId: string, providerRef: string, createdAt: Date): Promise<UpiOwnershipConfirmation>;
  findById(id: string): Promise<UpiOwnershipConfirmation | null>;
  findByProviderRef(providerRef: string): Promise<UpiOwnershipConfirmation | null>;
  markConfirmed(providerRef: string): Promise<void>;
  markFailed(providerRef: string): Promise<void>;
  // Most recent CONFIRMED row for this exact (userId, upiId) pair — the
  // check completeProfile relies on (ADR 0014).
  findLatestConfirmed(userId: string, upiId: string): Promise<UpiOwnershipConfirmation | null>;
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

// completeProfile's own penny-drop re-check (ADR 0014) — closes the gap
// where completeProfile previously trusted a prior client-side verify-upi-id
// call rather than re-verifying server-side.
export class InvalidUpiIdError extends Error {
  constructor() {
    super("This UPI ID couldn't be verified");
    this.name = "InvalidUpiIdError";
  }
}

// completeProfile's ownership-proof gate (ticket #38, ADR 0014) — thrown
// when there's no CONFIRMED UpiOwnershipConfirmation on file for the exact
// (userId, upiId) pair being submitted: the collect request was never sent,
// is still pending, was declined, or timed out.
export class UpiOwnershipUnconfirmedError extends Error {
  constructor() {
    super("UPI ID ownership hasn't been confirmed yet");
    this.name = "UpiOwnershipUnconfirmedError";
  }
}

export class UnknownUpiOwnershipConfirmationError extends Error {
  constructor() {
    super("Unknown UPI ownership confirmation");
    this.name = "UnknownUpiOwnershipConfirmationError";
  }
}
