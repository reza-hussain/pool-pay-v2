export type InvitationState = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";

export interface Invitation {
  id: string;
  poolId: string;
  inviteeUserId: string;
  // In paise. Individually assigned by the Organizer — not shared with any
  // other Invitation on the same Pool.
  assignedAmountPaise: number;
  state: InvitationState;
  // Opaque token for the phone-bound Invitation link (ticket #61) — unused
  // by the self-addressed Invitation created at Pool creation (ticket #58).
  token: string;
  expiresAt: Date;
  createdAt: Date;
  paidAt: Date | null;
}

export interface CreateInvitationData {
  poolId: string;
  inviteeUserId: string;
  assignedAmountPaise: number;
  token: string;
  expiresAt: Date;
}

export interface InvitationRepository {
  create(data: CreateInvitationData): Promise<Invitation>;
  // Only ever matches a PENDING Invitation — a paid, cancelled, or expired
  // one is not a thing left to pay against.
  findPendingByPoolAndInvitee(poolId: string, inviteeUserId: string): Promise<Invitation | null>;
  markPaid(id: string): Promise<Invitation>;
}

// Thrown when a Custom Split Pool deposit is attempted with no PENDING
// Invitation to back it — never sent one, already paid, cancelled, or
// expired all look the same from here: there's nothing left to pay.
export class InvitationNotFoundError extends Error {
  constructor() {
    super("No pending Invitation found for this Pool");
    this.name = "InvitationNotFoundError";
  }
}

// Custom Split payment is exact-match only (ADR 0016) — a shortfall or
// overage is rejected outright, never recorded.
export class InvitationAmountMismatchError extends Error {
  constructor() {
    super("Payment does not match the Invitation's assigned amount");
    this.name = "InvitationAmountMismatchError";
  }
}
