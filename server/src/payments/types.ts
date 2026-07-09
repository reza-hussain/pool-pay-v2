export interface DepositIntent {
  id: string;
  poolId: string;
  // Fake UPI VPA the QR/reference encodes.
  vpa: string;
  // Locked for Equal Split Pools, null (freely entered) for Open Pools.
  fixedAmountPaise: number | null;
}

export interface SpendConfirmation {
  id: string;
  poolId: string;
  merchantRef: string;
  amountPaise: number;
}

export interface TransferConfirmation {
  id: string;
  poolId: string;
  vpa: string;
  amountPaise: number;
}

// The one boundary between Pool Pay's own logic and the external UPI/BaaS
// partner (see docs/spec-mvp.md's Implementation Decisions — "Payment
// Provider interface"). No real provider exists yet; only the fake below,
// used everywhere until a later ticket wires up a real one behind this
// same interface.
export interface PaymentProvider {
  createDepositIntent(poolId: string, fixedAmountPaise: number | null): Promise<DepositIntent>;
  // Moves money from the Pool out to a merchant. The per-Spend fee (ADR 0010)
  // is Pool Pay's own monetization, not a payment-rail cost, so it's computed
  // and recorded by SpendService, not part of this confirmation.
  initiateSpend(
    poolId: string,
    merchantRef: string,
    amountPaise: number,
  ): Promise<SpendConfirmation>;
  // Moves money from the Pool out to a UPI ID — used for both reimbursing a
  // Member (this ticket) and, later, pro-rata refunds on Closure (ticket #9).
  // Never fee-bearing (ADR 0010).
  initiateTransfer(poolId: string, vpa: string, amountPaise: number): Promise<TransferConfirmation>;
}
