export type PendingSpendState = "PENDING" | "EXECUTED";

// A Spend proposed by a Member whose own remaining balance can't cover it
// alone (ADR-0020) — held for majority sign-off before the transfer actually
// executes. See SpendService.recordSpend for the amount-vs-balance gate that
// decides whether a Spend executes immediately or lands here instead.
export interface PendingSpend {
  id: string;
  poolId: string;
  recorderId: string;
  merchantRef: string;
  amountPaise: number;
  feePaise: number;
  state: PendingSpendState;
  // Set once majority is reached and the resulting Spend is created.
  resultingSpendId: string | null;
  createdAt: Date;
}

export interface PendingSpendRepository {
  create(
    poolId: string,
    recorderId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<PendingSpend>;
  findById(id: string): Promise<PendingSpend | null>;
  // Every currently-pending (not yet EXECUTED) PendingSpend in a Pool.
  listPendingByPool(poolId: string): Promise<PendingSpend[]>;
  markExecuted(id: string, resultingSpendId: string): Promise<PendingSpend>;
}

// One Member's sign-off on a PendingSpend (ADR-0020) — modeled on RefundVote
// (votes/), but scoped per-PendingSpend rather than per-Pool.
export interface SpendApproval {
  id: string;
  pendingSpendId: string;
  poolId: string;
  userId: string;
  createdAt: Date;
}

export interface SpendApprovalRepository {
  // Idempotent — approving twice returns the existing row (RefundVote's
  // one-vote-per-Member convention).
  create(pendingSpendId: string, poolId: string, userId: string): Promise<SpendApproval>;
  find(pendingSpendId: string, userId: string): Promise<SpendApproval | null>;
  listByPendingSpend(pendingSpendId: string): Promise<SpendApproval[]>;
}

export interface SpendApprovalStatus {
  pendingSpend: PendingSpend;
  // Currently active Members of the Pool (ADR-0020) — recomputed live on
  // every call, not fixed at proposal time, so a Member leaving/joining
  // changes what majority requires.
  eligibleApproverCount: number;
  approvalsCount: number;
  hasApproved: boolean;
}

export class PendingSpendNotFoundError extends Error {
  constructor() {
    super("Pending Spend not found");
    this.name = "PendingSpendNotFoundError";
  }
}

export class NotAPoolMemberError extends Error {
  constructor() {
    super("You must be a Member of this Pool to approve a Spend");
    this.name = "NotAPoolMemberError";
  }
}
