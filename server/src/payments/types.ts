export interface DepositIntent {
  id: string;
  poolId: string;
  // The Pool Pay account's own UPI VPA — fixed per merchant account, shown as
  // a fallback "Pay to UPI ID" alongside qrImageUrl (real providers return a
  // scannable QR; the fake has no image, only this text VPA).
  vpa: string;
  // Locked for Equal Split Pools, null (freely entered) for Open Pools.
  fixedAmountPaise: number | null;
  // Set only by a real provider (e.g. Cashfree's headless UPI QR session) —
  // a displayable QR image for the Member to scan (a base64 data: URI, not a
  // hosted https:// URL — see CashfreePaymentProvider). Additive/optional so
  // the fake-provider flow and its consumers are unaffected.
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

// Onboarding's Registered UPI ID (CONTEXT.md, ADR 0012) — verified via a real
// bank-account lookup (Decentro's VerifyPay) rather than trusted as free
// text. accountHolderName is shown back to the person to visually confirm
// ("Paying refunds to: Asha R.") — the same trust model UPI apps themselves
// use, not an automated exact-name match (bank records and casual self-entry
// often differ in nickname/spelling even for the account's rightful owner).
export interface VpaVerificationResult {
  verified: boolean;
  accountHolderName: string | null;
}

// A real UPI collect request raised against a specific VPA (ticket #38, ADR
// 0015) — proof-of-control for Onboarding's Registered UPI ID, since
// Cashfree has no API to check phone/VPA linkage directly. Unlike
// DepositIntent's QR (payer scans, amount not guaranteed), this pushes a
// request notification straight to the named VPA's UPI app for the exact
// amount, and confirms via the same webhook mechanism deposits already use.
export interface UpiCollectRequest {
  id: string;
  vpa: string;
  amountPaise: number;
}

// The one boundary between Pool Pay's own logic and the external UPI/BaaS
// partner (see docs/spec-mvp.md's Implementation Decisions — "Payment
// Provider interface"). CashfreePaymentProvider is the real implementation
// (ADR 0013); FakePaymentProvider backs every other ticket's tests.
export interface PaymentProvider {
  // customerPhone is the requesting Member's own phone number (Pool Pay
  // accounts are phone/OTP-based, so this is always available) — Cashfree's
  // Orders API requires a real customer phone per order.
  createDepositIntent(
    poolId: string,
    fixedAmountPaise: number | null,
    customerPhone: string,
  ): Promise<DepositIntent>;
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
  // Checks whether a UPI ID is real and belongs to a live bank account,
  // returning the bank's registered account-holder name for display.
  verifyVpa(vpa: string): Promise<VpaVerificationResult>;
  // Raises a real UPI collect request for amountPaise against vpa (ticket
  // #38) — the person must approve it from their own UPI app, which is
  // real-world proof they currently control that VPA. customerPhone is the
  // requesting Member's own phone (same requirement as createDepositIntent).
  // customerId must be alphanumeric/underscore/hyphen only — confirmed
  // against a live sandbox call on 2026-08-21, Cashfree's Orders API rejects
  // a raw phone number here (the leading "+") with
  // customer_details.customer_id_invalid. userId (a cuid) satisfies this the
  // same way poolId already does for createDepositIntent.
  // Confirmation arrives later via parseDepositWebhook, keyed by this
  // request's id, same as any other Order-backed payment.
  initiateUpiOwnershipCollectRequest(
    vpa: string,
    amountPaise: number,
    customerId: string,
    customerPhone: string,
  ): Promise<UpiCollectRequest>;
  // Refunds a confirmed ownership collect request straight back to the same
  // VPA (ticket #38) — not scoped to any Pool, since this happens during
  // Onboarding before the person has joined one.
  refundUpiOwnershipCollectRequest(vpa: string, amountPaise: number): Promise<{ id: string }>;
  // Normalizes a provider-specific deposit-confirmation callback into a
  // common shape, or null if the payload isn't a recognized event (ticket
  // #15) — DepositService.confirmDeposit takes it from there, keyed by
  // providerRef, so the provider itself doesn't need to know about Pools,
  // Members, or the pending-deposit ledger.
  parseDepositWebhook(payload: unknown): DepositWebhookEvent | null;
  // Authenticates a deposit webhook call before parseDepositWebhook touches
  // it — vendor-specific (Cashfree: HMAC-SHA256 over the raw body), so it
  // lives behind this same seam rather than the generic webhook router
  // knowing how any particular provider signs its callbacks. rawBody must be
  // the exact bytes the provider signed, not the parsed/re-serialized JSON.
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | undefined>): boolean;
}
