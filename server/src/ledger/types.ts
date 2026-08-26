export type LedgerEntryType = "DEPOSIT" | "SPEND" | "REIMBURSEMENT" | "REFUND";

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  poolId: string;
  amountPaise: number;
  // Only set for SPEND entries — kept separate from amountPaise (the
  // merchant-facing amount) so Members can verify the fee math themselves
  // (ADR 0008), rather than seeing one collapsed number.
  feePaise?: number;
  // DEPOSIT: depositing Member's userId. SPEND: merchant reference.
  // REIMBURSEMENT/REFUND: the Member's userId.
  counterparty: string;
  // Only set for SPEND entries — the Member who made the Spend
  // (Spend.userId), distinct from `counterparty` which stays the merchant
  // reference for SPEND. Lets a Spend be traced back to its actor without
  // changing what `counterparty` already means for every entry type.
  actor?: string;
  createdAt: Date;
}

export interface LedgerQueryOptions {
  from?: Date;
  to?: Date;
  search?: string;
  counterparty?: string;
  types?: LedgerEntryType[];
  cursor?: string;
  limit?: number;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  nextCursor: string | null;
}

export class NotAPoolMemberError extends Error {
  constructor() {
    super("You must be a Member of this Pool to view its ledger");
    this.name = "NotAPoolMemberError";
  }
}

export class InvalidLedgerCursorError extends Error {
  constructor() {
    super("Ledger pagination cursor is invalid");
    this.name = "InvalidLedgerCursorError";
  }
}
