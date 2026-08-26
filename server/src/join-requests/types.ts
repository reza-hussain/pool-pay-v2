export type JoinRequestState = "PENDING" | "APPROVED" | "REJECTED";

// Approval-gated joining for Equal Split Pools (ticket #86, parent #83).
// Modeled as its own entity rather than a status on Membership — a
// declined/still-pending request never becomes one, so folding this into
// Membership would mean rows that were never actually memberships.
export interface JoinRequest {
  id: string;
  poolId: string;
  requesterUserId: string;
  state: JoinRequestState;
  createdAt: Date;
  // Set when the Organizer approves or declines — never on its own; a
  // PENDING request has no expiry and stays actionable indefinitely.
  decidedAt: Date | null;
}

export interface CreateJoinRequestData {
  poolId: string;
  requesterUserId: string;
}

export interface JoinRequestRepository {
  create(data: CreateJoinRequestData): Promise<JoinRequest>;
  findById(id: string): Promise<JoinRequest | null>;
  // Most recent request (any state) for this (Pool, requester) pair — used to
  // decide whether a fresh join attempt should be idempotent against an
  // outstanding PENDING request or blocked by a prior REJECTED one.
  findLatestByPoolAndRequester(poolId: string, requesterUserId: string): Promise<JoinRequest | null>;
  // Every PENDING request for one Pool — the Organizer's All Members "Pending
  // requests" section.
  listPendingByPool(poolId: string): Promise<JoinRequest[]>;
  approve(id: string): Promise<JoinRequest>;
  reject(id: string): Promise<JoinRequest>;
}

// The requester already has an outstanding PENDING request for this Pool —
// re-submitting the same Pool Code/link is idempotent, not an error; thrown
// only where a caller needs to distinguish (none currently do, kept for
// symmetry with the other JoinRequest error types).
export class JoinRequestNotFoundError extends Error {
  constructor() {
    super("No Join Request found with that id for this Pool");
    this.name = "JoinRequestNotFoundError";
  }
}

// Approve/decline only make sense against a still-PENDING request — one
// already decided is a done deal.
export class JoinRequestNotPendingError extends Error {
  constructor() {
    super("This Join Request has already been decided");
    this.name = "JoinRequestNotPendingError";
  }
}

// The most recent request for this (Pool, requester) was declined — blocks
// an immediate re-request via the same Pool Code/link (ticket #86 AC).
export class JoinRequestAlreadyDeclinedError extends Error {
  constructor() {
    super("Your request to join this Pool was declined");
    this.name = "JoinRequestAlreadyDeclinedError";
  }
}
