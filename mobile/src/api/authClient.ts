const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class AuthApiError extends Error {}

export interface RequestOtpResult {
  requestId: string;
}

export interface PublicUser {
  id: string;
  phoneNumber: string;
  isVerified: boolean;
  isSubscribed: boolean;
  name: string | null;
  email: string | null;
  dateOfBirth: string | null;
  upiId: string | null;
  avatarUrl: string | null;
  isOnboarded: boolean;
}

// Onboarding's profile-setup step (CONTEXT.md, ADR 0012) — dateOfBirth is
// "YYYY-MM-DD".
export interface CompleteProfileInput {
  name: string;
  email: string;
  dateOfBirth: string;
  upiId: string;
  avatarUrl?: string | null;
}

export interface CompleteProfileResult {
  user: PublicUser;
}

// Registered UPI ID verification (ADR 0012) — a real bank-account lookup,
// not just a format check. accountHolderName is shown back to the person to
// visually confirm it's really them, rather than trusted as an exact match.
export interface VerifyUpiIdResult {
  verified: boolean;
  accountHolderName: string | null;
}

export interface VerifyOtpResult {
  token: string;
  isNewUser: boolean;
  user: PublicUser;
}

export interface VerifyIdentityResult {
  user: PublicUser;
}

export interface SubscribeResult {
  user: PublicUser;
}

// UPI ownership proof-of-control (ticket #38, ADR 0014) — a real ~₹1 UPI
// collect request the person approves from their own UPI app, real-world
// proof they control the typed UPI ID. Call only after verifyUpiId's penny
// drop already passed for this exact text.
export type UpiOwnershipStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface InitiateUpiOwnershipResult {
  confirmationId: string;
  amountPaise: number;
  status: UpiOwnershipStatus;
}

export interface UpiOwnershipStatusResult {
  status: UpiOwnershipStatus;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export function requestOtp(phoneNumber: string): Promise<RequestOtpResult> {
  return postJson("/auth/otp/request", { phoneNumber });
}

export function verifyOtp(requestId: string, code: string): Promise<VerifyOtpResult> {
  return postJson("/auth/otp/verify", { requestId, code });
}

// Stubbed full-KYC (ticket #12) — passes instantly, no real verification flow yet.
export function verifyIdentity(token: string, panNumber: string): Promise<VerifyIdentityResult> {
  return postJson("/auth/verify", { panNumber }, token);
}

// Stubbed freemium subscription (ticket #13) — passes instantly, no real billing flow yet.
export function subscribe(token: string): Promise<SubscribeResult> {
  return postJson("/auth/subscribe", undefined, token);
}

// Onboarding's Registered UPI ID (ADR 0012) — call before completeProfile so
// the person can see the resolved account-holder name and confirm it's them.
export function verifyUpiId(token: string, upiId: string): Promise<VerifyUpiIdResult> {
  return postJson("/auth/verify-upi-id", { upiId }, token);
}

// Onboarding's profile-setup step (CONTEXT.md, ADR 0012) — mandatory,
// one-time, blocks reaching Home.
export function completeProfile(
  token: string,
  input: CompleteProfileInput,
): Promise<CompleteProfileResult> {
  return postJson("/auth/complete-profile", input, token);
}

// Starts the real ~₹1 UPI collect-request ownership check (ticket #38) —
// the person must approve it from their own UPI app.
export function initiateUpiOwnershipCheck(
  token: string,
  upiId: string,
): Promise<InitiateUpiOwnershipResult> {
  return postJson("/auth/upi-ownership/initiate", { upiId }, token);
}

// Poll while showing "Waiting for you to approve…" (ticket #38) until
// status leaves PENDING.
export function getUpiOwnershipStatus(
  token: string,
  confirmationId: string,
): Promise<UpiOwnershipStatusResult> {
  return getJson(`/auth/upi-ownership/${confirmationId}`, token);
}
