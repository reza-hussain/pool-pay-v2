export interface Deposit {
  id: string;
  poolId: string;
  userId: string;
  amountPaise: number;
  createdAt: Date;
}

export interface DepositRepository {
  create(poolId: string, userId: string, amountPaise: number): Promise<Deposit>;
  sumByPool(poolId: string): Promise<number>;
  sumByPoolAndUser(poolId: string, userId: string): Promise<number>;
  listByPool(poolId: string): Promise<Deposit[]>;
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
