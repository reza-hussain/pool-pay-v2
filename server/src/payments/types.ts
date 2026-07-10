export interface DepositIntent {
  id: string;
  poolId: string;
  // The Pool Pay account's own UPI VPA — fixed per merchant account, shown as
  // a fallback "Pay to UPI ID" alongside qrImageUrl (real providers return a
  // scannable QR; the fake has no image, only this text VPA).
  vpa: string;
  // Locked for Equal Split Pools, null (freely entered) for Open Pools.
  fixedAmountPaise: number | null;
  // Set only by a real provider (e.g. Decentro's Dynamic QR) — a displayable
  // QR image URL for the Member to scan. Additive/optional so the existing
  // fake-provider flow and its consumers are unaffected (ticket #14's real
  // adapter must implement this same interface with no other ticket's logic
  // changing).
  qrImageUrl?: string;
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
