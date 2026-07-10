export interface Deposit {
  id: string;
  poolId: string;
  userId: string;
  amountPaise: number;
  createdAt: Date;
}

export interface DepositRepository {
  create(poolId: string, userId: string, amountPaise: number): Promise<Deposit>;
  findById(id: string): Promise<Deposit | null>;
  sumByPool(poolId: string): Promise<number>;
  sumByPoolAndUser(poolId: string, userId: string): Promise<number>;
  listByPool(poolId: string): Promise<Deposit[]>;
}

// See PendingDeposit in schema.prisma for why this exists: attributes a
// webhook (or self-report) confirmation back to the Member it was for, and
// guarantees a deposit intent is only ever credited once.
export interface PendingDeposit {
  id: string;
  providerRef: string;
  poolId: string;
  userId: string;
  resultingDepositId: string | null;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface PendingDepositRepository {
  create(providerRef: string, poolId: string, userId: string): Promise<PendingDeposit>;
  findByProviderRef(providerRef: string): Promise<PendingDeposit | null>;
  markConsumed(providerRef: string, resultingDepositId: string): Promise<void>;
}

export class UnknownDepositReferenceError extends Error {
  constructor() {
    super("Unknown deposit reference");
    this.name = "UnknownDepositReferenceError";
  }
}

export interface ContributionSummary {
  contributedPaise: number;
  // null for Open Pools — there's no fixed share to compare against.
  expectedPaise: number | null;
  // Positive = still owed, negative = overpaid, null for Open Pools.
  shortfallPaise: number | null;
}

export class InvalidDepositAmountError extends Error {
  constructor() {
    super("Deposit amount must be a positive whole number of paise");
    this.name = "InvalidDepositAmountError";
  }
}

export class PoolNotAcceptingDepositsError extends Error {
  constructor() {
    super("This Pool is not accepting deposits");
    this.name = "PoolNotAcceptingDepositsError";
  }
}

export class NotAMemberError extends Error {
  constructor() {
    super("You must join this Pool before depositing");
    this.name = "NotAMemberError";
  }
}
