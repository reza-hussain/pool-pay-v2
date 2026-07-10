export interface MerchantBreakdownEntry {
  merchantRef: string;
  amountPaise: number;
}

export interface CrossPoolAnalytics {
  poolCount: number;
  totalSpendPaise: number;
  // No Spend-category concept exists anywhere in the domain model yet (no
  // ticket has added one) — merchant reference is the closest existing
  // dimension, so "category breakdown" (ADR 0011) is a breakdown by
  // merchantRef until a real category feature exists.
  byMerchant: MerchantBreakdownEntry[];
}

export class NotSubscribedError extends Error {
  constructor() {
    super("Subscribe to view cross-Pool analytics");
    this.name = "NotSubscribedError";
  }
}
