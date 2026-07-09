export type PoolType = "EQUAL_SPLIT" | "OPEN";
export type PoolState = "ACTIVE" | "LOCKED" | "CLOSED";

export interface Pool {
  id: string;
  name: string;
  type: PoolType;
  // In paise (1 INR = 100 paise). Required for EQUAL_SPLIT, always null for OPEN.
  perPersonAmountPaise: number | null;
  state: PoolState;
  organizerId: string;
  createdAt: Date;
}

export interface CreatePoolInput {
  name: string;
  type: PoolType;
  perPersonAmountPaise?: number;
}

export interface PoolRepository {
  create(
    organizerId: string,
    data: { name: string; type: PoolType; perPersonAmountPaise: number | null },
  ): Promise<Pool>;
}

export class InvalidPoolNameError extends Error {
  constructor() {
    super("Pool name is required");
    this.name = "InvalidPoolNameError";
  }
}

export class MissingPerPersonAmountError extends Error {
  constructor() {
    super("Equal Split Pools require a per-person amount");
    this.name = "MissingPerPersonAmountError";
  }
}

export class UnexpectedPerPersonAmountError extends Error {
  constructor() {
    super("Open Pools must not have a per-person amount");
    this.name = "UnexpectedPerPersonAmountError";
  }
}

export class InvalidPerPersonAmountError extends Error {
  constructor() {
    super("Per-person amount must be a positive whole number of paise");
    this.name = "InvalidPerPersonAmountError";
  }
}
