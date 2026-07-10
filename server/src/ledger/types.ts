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
  createdAt: Date;
}

export class NotAPoolMemberError extends Error {
  constructor() {
    super("You must be a Member of this Pool to view its ledger");
    this.name = "NotAPoolMemberError";
  }
}
