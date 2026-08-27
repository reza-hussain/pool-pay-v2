const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class JoinRequestsApiError extends Error {}

export type JoinRequestState = "PENDING" | "APPROVED" | "REJECTED";

export interface JoinRequest {
  id: string;
  poolId: string;
  requesterUserId: string;
  state: JoinRequestState;
  createdAt: string;
  decidedAt: string | null;
}

// What the Organizer sees on All Members' Pending requests section — one
// JoinRequest enriched with the requester's identity.
export interface JoinRequestForOrganizer {
  joinRequest: JoinRequest;
  requesterName: string | null;
  requesterPhoneNumber: string;
}

async function authedFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new JoinRequestsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data;
}

export async function listPendingJoinRequests(token: string, poolId: string): Promise<JoinRequestForOrganizer[]> {
  const data = await authedFetch(`/pools/${poolId}/join-requests`, token);
  return data.joinRequests as JoinRequestForOrganizer[];
}

export async function approveJoinRequest(token: string, poolId: string, joinRequestId: string): Promise<JoinRequest> {
  const data = await authedFetch(`/pools/${poolId}/join-requests/${joinRequestId}/approve`, token, {
    method: "POST",
  });
  return data.joinRequest as JoinRequest;
}

export async function declineJoinRequest(token: string, poolId: string, joinRequestId: string): Promise<JoinRequest> {
  const data = await authedFetch(`/pools/${poolId}/join-requests/${joinRequestId}/decline`, token, {
    method: "POST",
  });
  return data.joinRequest as JoinRequest;
}
