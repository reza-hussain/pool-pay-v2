export interface User {
  id: string;
  phoneNumber: string;
  createdAt: Date;
  isVerified: boolean;
  isSubscribed: boolean;
}

export interface UserRepository {
  findByPhoneNumber(phoneNumber: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(phoneNumber: string): Promise<User>;
  markFullyVerified(id: string): Promise<User>;
  subscribe(id: string): Promise<User>;
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
