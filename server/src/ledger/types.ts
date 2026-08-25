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
  // Only set for SPEND entries — the Member who initiated the Transfer out
  // (Spend.userId). Separate from `counterparty`, which stays the merchant
  // reference for a Spend; this is what lets Transaction Detail (ADR-0018)
  // show and link to who actually spent the money.
  spendActorUserId?: string;
  createdAt: Date;
}

export interface LedgerQuery {
  from?: Date;
  to?: Date;
  search?: string;
  // A Member's userId, matched against `counterparty`. A SPEND's
  // `counterparty` is a merchant reference rather than a userId, so SPEND
  // entries never match this filter (ADR-0018).
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
