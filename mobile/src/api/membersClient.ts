import type { JoinRequest } from "./joinRequestsClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class MembersApiError extends Error {}

export interface Membership {
  id: string;
  poolId: string;
  userId: string;
  role: "ORGANIZER" | "MEMBER";
  joinedAt: string;
}

// What joining via Pool Code/Invite Link resolves to (ticket #86): an
// immediate Membership for every Pool type except Equal Split, which now
// creates a JoinRequest awaiting the Organizer's approval instead.
export type JoinResult =
  | { kind: "MEMBERSHIP"; membership: Membership }
  | { kind: "JOIN_REQUEST"; joinRequest: JoinRequest };

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

export async function joinByPoolId(token: string, poolId: string): Promise<JoinResult> {
  return postJson<JoinResult>(`/pools/${poolId}/join`, token);
}

export async function joinByCode(token: string, code: string): Promise<JoinResult> {
  return postJson<JoinResult>("/pools/join-by-code", token, { code });
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

export async function removeMember(token: string, poolId: string, memberId: string): Promise<void> {
  const res = await fetch(`${API_URL}/pools/${poolId}/members/${memberId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
}
