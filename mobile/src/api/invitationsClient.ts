import type { Pool } from "./poolsClient";
import type { Membership } from "./membersClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class InvitationsApiError extends Error {}

export type InvitationState = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";

export type InvitationExpiryPreset = "24h" | "3d" | "7d";

export interface Invitation {
  id: string;
  poolId: string;
  inviteeUserId: string;
  // Null for the Equal Split phone/contact variant (ticket #87) — no
  // per-invitee assigned share, accepted at zero cost instead of paid.
  assignedAmountPaise: number | null;
  token: string;
  state: InvitationState;
  expiresAt: string;
  createdAt: string;
  paidAt: string | null;
}

// What the invitee sees — one Invitation enriched with the Pool it's for
// and the Organizer's name, so the screen can render in one request.
export interface InvitationForInvitee {
  invitation: Invitation;
  pool: Pool;
  organizerName: string | null;
}

// What the Organizer sees for one Pool's sent Invitations — enriched with
// the invitee's identity.
export interface SentInvitation {
  invitation: Invitation;
  inviteeName: string | null;
  inviteePhoneNumber: string;
}

async function authedFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new InvitationsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data;
}

export async function sendInvitation(
  token: string,
  poolId: string,
  phoneNumber: string,
  assignedAmountPaise: number,
  expiryPreset: InvitationExpiryPreset,
): Promise<Invitation> {
  const data = await authedFetch(`/pools/${poolId}/invitations`, token, {
    method: "POST",
    body: JSON.stringify({ phoneNumber, assignedAmountPaise, expiryPreset }),
  });
  return data.invitation as Invitation;
}

// The Organizer's direct phone/contact add on an Equal Split Pool (ticket
// #87) — same entity/endpoint as sendInvitation, but with no assigned
// amount: the Organizer choosing this person is the approval, though the
// invitee still must explicitly accept (see acceptInvitation).
export async function sendEqualSplitInvitation(
  token: string,
  poolId: string,
  phoneNumber: string,
  expiryPreset?: InvitationExpiryPreset,
): Promise<Invitation> {
  const data = await authedFetch(`/pools/${poolId}/invitations`, token, {
    method: "POST",
    body: JSON.stringify({ phoneNumber, expiryPreset }),
  });
  return data.invitation as Invitation;
}

// Accepts the Equal Split phone/contact Invitation variant — creates a
// Membership immediately, at zero cost, no Deposit involved.
export async function acceptInvitation(token: string, invitationId: string): Promise<Membership> {
  const data = await authedFetch(`/invitations/${invitationId}/accept`, token, { method: "POST" });
  return data.membership as Membership;
}

export async function cancelInvitation(token: string, poolId: string, invitationId: string): Promise<void> {
  await authedFetch(`/pools/${poolId}/invitations/${invitationId}`, token, { method: "DELETE" });
}

export async function listSentInvitations(token: string, poolId: string): Promise<SentInvitation[]> {
  const data = await authedFetch(`/pools/${poolId}/invitations`, token);
  return data.invitations as SentInvitation[];
}

export async function listMyInvitations(token: string): Promise<InvitationForInvitee[]> {
  const data = await authedFetch(`/invitations/mine`, token);
  return data.invitations as InvitationForInvitee[];
}

export async function getInvitationByToken(
  sessionToken: string,
  invitationToken: string,
): Promise<InvitationForInvitee> {
  const data = await authedFetch(`/invitations/token/${invitationToken}`, sessionToken);
  return data.invitationForInvitee as InvitationForInvitee;
}
