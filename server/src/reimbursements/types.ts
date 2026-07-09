export interface Reimbursement {
  id: string;
  poolId: string;
  // The Member being paid back, not the Organizer who initiated the transfer
  // (the Organizer is always pool.organizerId — no need to store it again).
  memberId: string;
  vpa: string;
  amountPaise: number;
  createdAt: Date;
}

export interface ReimbursementRepository {
  create(poolId: string, memberId: string, vpa: string, amountPaise: number): Promise<Reimbursement>;
  sumByPool(poolId: string): Promise<number>;
  listByPool(poolId: string): Promise<Reimbursement[]>;
}

export class InvalidReimbursementAmountError extends Error {
  constructor() {
    super("Reimbursement amount must be a positive whole number of paise");
    this.name = "InvalidReimbursementAmountError";
  }
}

export class InvalidVpaError extends Error {
  constructor() {
    super("A UPI ID is required to reimburse a Member");
    this.name = "InvalidVpaError";
  }
}

export class RecipientNotAMemberError extends Error {
  constructor() {
    super("The reimbursement recipient must be a Member of this Pool");
    this.name = "RecipientNotAMemberError";
  }
}

export class InsufficientPoolBalanceError extends Error {
  constructor() {
    super("This Reimbursement would exceed the Pool's current balance");
    this.name = "InsufficientPoolBalanceError";
  }
}
