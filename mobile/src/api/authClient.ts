const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class AuthApiError extends Error {}

export interface RequestOtpResult {
  requestId: string;
}

export interface VerifyOtpResult {
  token: string;
  isNewUser: boolean;
  user: { id: string; phoneNumber: string; isVerified: boolean };
}

export interface VerifyIdentityResult {
  user: { id: string; phoneNumber: string; isVerified: boolean };
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

export function requestOtp(phoneNumber: string): Promise<RequestOtpResult> {
  return postJson("/auth/otp/request", { phoneNumber });
}

export function verifyOtp(requestId: string, code: string): Promise<VerifyOtpResult> {
  return postJson("/auth/otp/verify", { requestId, code });
}

// Stubbed full-KYC (ticket #12) — passes instantly, no real verification flow yet.
export function verifyIdentity(token: string): Promise<VerifyIdentityResult> {
  return postJson("/auth/verify", undefined, token);
}
