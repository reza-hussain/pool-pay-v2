export interface Spend {
  id: string;
  poolId: string;
  userId: string;
  merchantRef: string;
  amountPaise: number;
  feePaise: number;
  createdAt: Date;
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

export class InsufficientPoolBalanceError extends Error {
  constructor() {
    super("This Spend, with its fee, would exceed the Pool's current balance");
    this.name = "InsufficientPoolBalanceError";
  }
}
