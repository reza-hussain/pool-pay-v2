export type ActivityEntryType = "DEPOSIT" | "REFUND";

export interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  poolId: string;
  poolName: string;
  amountPaise: number;
  counterpartyName: string;
  createdAt: Date;
}
