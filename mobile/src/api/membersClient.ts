import type { Pool } from "./poolsClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class MembersApiError extends Error {}

export interface Membership {
  id: string;
  poolId: string;
  userId: string;
  role: "ORGANIZER" | "MEMBER";
  joinedAt: string;
}

// Organizer review-and-adjust step (ADR-0022) — the computed default refund
// for a Departure, before removeMember/leaveSelf actually pays it out.
export interface DeparturePreview {
  amountPaise: number;
}

// What leaveSelf/removeMember actually pay out — null when there was
// nothing to refund (membership-service.ts payDepartureAndRemove).
export interface DepartureRefund {
  id: string;
  poolId: string;
  memberId: string;
  vpa: string;
  amountPaise: number;
  createdAt: string;
}

async function postJson<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export async function joinByPoolId(token: string, poolId: string): Promise<Membership> {
  const { membership } = await postJson<{ membership: Membership }>(
    `/pools/${poolId}/join`,
    token,
  );
  return membership;
}

export async function joinByCode(token: string, code: string): Promise<Membership> {
  const { membership } = await postJson<{ membership: Membership }>(
    "/pools/join-by-code",
    token,
    { code },
  );
  return membership;
}

export async function listMembers(token: string, poolId: string): Promise<Membership[]> {
  const res = await fetch(`${API_URL}/pools/${poolId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.members as Membership[];
}

export async function removeMember(
  token: string,
  poolId: string,
  memberId: string,
  adjustedAmountPaise?: number,
): Promise<void> {
  const res = await fetch(`${API_URL}/pools/${poolId}/members/${memberId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(adjustedAmountPaise !== undefined ? { adjustedAmountPaise } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
}

// Organizer review-and-adjust step (ADR-0022): the computed default refund
// for removing `memberId`, shown before removeMember confirms it. Read-only.
export async function previewDeparture(
  token: string,
  poolId: string,
  memberId: string,
): Promise<DeparturePreview> {
  const res = await fetch(`${API_URL}/pools/${poolId}/members/${memberId}/departure/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as DeparturePreview;
}

// Self-leave (ADR-0022/0023): any active, non-Organizer Member can remove
// themselves — always paid the computed default, no adjustment.
export async function leaveSelf(token: string, poolId: string): Promise<DepartureRefund | null> {
  const res = await fetch(`${API_URL}/pools/${poolId}/leave`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return (data as { refund: DepartureRefund | null }).refund;
}

// Organizer Transfer (ADR-0023): unilateral, no vote required.
export async function transferOrganizer(
  token: string,
  poolId: string,
  newOrganizerUserId: string,
): Promise<Pool> {
  const { pool } = await postJson<{ pool: Pool }>(`/pools/${poolId}/organizer`, token, {
    newOrganizerUserId,
  });
  return pool;
}

// "Your Remaining Balance" (ADR-0022) for the caller themselves — raw, not
// floored at zero (see server LedgerService.getMemberBalance).
export async function getMyBalance(token: string, poolId: string): Promise<number> {
  const res = await fetch(`${API_URL}/pools/${poolId}/members/me/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return (data as { balancePaise: number }).balancePaise;
}
