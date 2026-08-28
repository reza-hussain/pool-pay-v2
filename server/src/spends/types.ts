import type { PendingSpend } from "../spend-approvals/types.js";

export interface Spend {
  id: string;
  poolId: string;
  userId: string;
  merchantRef: string;
  amountPaise: number;
  feePaise: number;
  createdAt: Date;
}

// SpendService.recordSpend's two-tier gate (ADR-0020): a Spend within the
// recorder's own remaining balance executes immediately (`spend` set); a
// larger one is held for majority approval instead (`pendingSpend` set).
// Exactly one of the two is ever non-null.
export interface RecordSpendResult {
  spend: Spend | null;
  pendingSpend: PendingSpend | null;
}

export interface SpendRepository {
  create(
    poolId: string,
    userId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<Spend>;
  // Sum of amountPaise + feePaise across a Pool's Spends — the total deducted
  // from the Pool's balance, not just the merchant-facing amount.
  sumByPool(poolId: string): Promise<number>;
  listByPool(poolId: string): Promise<Spend[]>;
}

// The actual, post-insolvency-sit-out split of one Spend's cost across the
// Members charged for it (ADR-0021) — never assumed to be a clean equal
// division after the fact. One row per Member actually charged.
export interface SpendAttribution {
  id: string;
  spendId: string;
  poolId: string;
  memberId: string;
  amountPaise: number;
  createdAt: Date;
}

export interface SpendAttributionRepository {
  // Persists the full, already-computed split for one Spend in one call —
  // the split is only ever written once, atomically, alongside the Spend
  // itself (see SpendService.recordSpend).
  createForSpend(
    spendId: string,
    poolId: string,
    shares: Array<{ memberId: string; amountPaise: number }>,
  ): Promise<SpendAttribution[]>;
  // A Member's total attributed cost across every Spend in a Pool — the
  // subtrahend in Your Remaining Balance (ADR-0022).
  sumByPoolAndMember(poolId: string, memberId: string): Promise<number>;
  listByPool(poolId: string): Promise<SpendAttribution[]>;
  listBySpend(spendId: string): Promise<SpendAttribution[]>;
}

export class InvalidSpendAmountError extends Error {
  constructor() {
    super("Spend amount must be a positive whole number of paise");
    this.name = "InvalidSpendAmountError";
  }
}

export class InvalidMerchantReferenceError extends Error {
  constructor() {
    super("Merchant reference is required");
    this.name = "InvalidMerchantReferenceError";
  }
}

export class NotAPoolMemberError extends Error {
  constructor() {
    super("You must be a Member of this Pool to record a Spend");
    this.name = "NotAPoolMemberError";
  }
}

// Replaces the old whole-Pool-balance InsufficientPoolBalanceError check
// (ADR-0021): thrown only once the equal-split cascade has excluded every
// insolvent Member down to none left able to pay, distinguishing "no Member
// can afford any share of this" from a single Member sitting out.
export class SpendUnaffordableByAnyMemberError extends Error {
  constructor() {
    super(
      "Not even the smallest possible paying group of Members can cover this Spend, with its fee",
    );
    this.name = "SpendUnaffordableByAnyMemberError";
  }
}
