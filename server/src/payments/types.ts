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

export interface DepositWebhookEvent {
  // Matches DepositIntent.id from the createDepositIntent call this
  // confirmation is for.
  providerRef: string;
  amountPaise: number;
  status: "SUCCESS" | "FAILED";
}

// The one boundary between Pool Pay's own logic and the external UPI/BaaS
// partner (see docs/spec-mvp.md's Implementation Decisions — "Payment
// Provider interface"). DecentroPaymentProvider is the real implementation
// (ticket #14); FakePaymentProvider backs every other ticket's tests.
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
  // Normalizes a provider-specific deposit-confirmation callback into a
  // common shape, or null if the payload isn't a recognized event (ticket
  // #15) — DepositService.confirmDeposit takes it from there, keyed by
  // providerRef, so the provider itself doesn't need to know about Pools,
  // Members, or the pending-deposit ledger.
  parseDepositWebhook(payload: unknown): DepositWebhookEvent | null;
}
