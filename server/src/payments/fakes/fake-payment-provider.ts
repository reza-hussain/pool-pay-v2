import type {
  DepositIntent,
  DepositWebhookEvent,
  PaymentProvider,
  SpendConfirmation,
  TransferConfirmation,
  UpiCollectRequest,
  VpaVerificationResult,
} from "../types.js";

// A real UPI ID always has the form <handle>@<bank/PSP name> — good enough
// for the fake to decide "verified" without a real bank lookup.
const VPA_PATTERN = /^[\w.\-]+@[\w.\-]+$/;

let nextId = 1;

export interface SimulatedDeposit extends DepositWebhookEvent {
  poolId: string;
}

export class FakePaymentProvider implements PaymentProvider {
  private intents = new Map<string, DepositIntent>();
  private collectRequests = new Map<string, UpiCollectRequest>();

  async createDepositIntent(
    poolId: string,
    fixedAmountPaise: number | null,
    _customerPhone: string,
  ): Promise<DepositIntent> {
    const intent: DepositIntent = {
      id: `intent_${nextId++}`,
      poolId,
      vpa: `${poolId}@fakebank`,
      fixedAmountPaise,
    };
    this.intents.set(intent.id, intent);
    return intent;
  }

  // Test-only: simulates the BaaS partner confirming this intent was paid
  // for `amountPaise` — which may differ from the intent's fixedAmountPaise,
  // since not every UPI app honors a locked amount. Shaped like a parsed
  // webhook event so it can feed DepositService.confirmDeposit directly.
  simulateDeposit(intentId: string, amountPaise: number): SimulatedDeposit {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Unknown deposit intent: ${intentId}`);
    }
    return { poolId: intent.poolId, providerRef: intentId, amountPaise, status: "SUCCESS" };
  }

  // The fake's webhook payload IS a DepositWebhookEvent already — no
  // provider-specific shape to normalize, unlike the real Cashfree adapter.
  parseDepositWebhook(payload: unknown): DepositWebhookEvent | null {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "providerRef" in payload &&
      "amountPaise" in payload &&
      "status" in payload
    ) {
      const { providerRef, amountPaise, status } = payload as DepositWebhookEvent;
      if (typeof providerRef === "string" && typeof amountPaise === "number") {
        return { providerRef, amountPaise, status };
      }
    }
    return null;
  }

  async initiateSpend(
    poolId: string,
    merchantRef: string,
    amountPaise: number,
  ): Promise<SpendConfirmation> {
    return { id: `spend_confirmation_${nextId++}`, poolId, merchantRef, amountPaise };
  }

  async initiateTransfer(
    poolId: string,
    vpa: string,
    amountPaise: number,
  ): Promise<TransferConfirmation> {
    return { id: `transfer_confirmation_${nextId++}`, poolId, vpa, amountPaise };
  }

  async verifyVpa(vpa: string): Promise<VpaVerificationResult> {
    if (!VPA_PATTERN.test(vpa)) {
      return { verified: false, accountHolderName: null };
    }
    const localPart = vpa.split("@")[0].replace(/[._-]+/g, " ").trim();
    const accountHolderName = localPart
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ");
    return { verified: true, accountHolderName: accountHolderName || null };
  }

  async initiateUpiOwnershipCollectRequest(
    vpa: string,
    amountPaise: number,
    _customerPhone: string,
  ): Promise<UpiCollectRequest> {
    const request: UpiCollectRequest = { id: `collect_${nextId++}`, vpa, amountPaise };
    this.collectRequests.set(request.id, request);
    return request;
  }

  // Test-only: simulates the person approving (or the webhook otherwise
  // confirming) the named collect request — shaped like a parsed webhook
  // event so it can feed the same webhook route/AuthService.confirmUpiOwnership
  // path as a real Cashfree callback would.
  simulateOwnershipConfirmation(collectRequestId: string, amountPaise: number): DepositWebhookEvent {
    const request = this.collectRequests.get(collectRequestId);
    if (!request) {
      throw new Error(`Unknown UPI ownership collect request: ${collectRequestId}`);
    }
    return { providerRef: collectRequestId, amountPaise, status: "SUCCESS" };
  }

  async refundUpiOwnershipCollectRequest(_vpa: string, _amountPaise: number): Promise<{ id: string }> {
    return { id: `ownership_refund_${nextId++}` };
  }

  // Test-only: for router/HTTP-level tests that only see AuthService's
  // public initiate response (no providerRef) — finds the most recent
  // collect request raised for vpa, the same way FakeOtpSender.lastCodeSentTo
  // lets a test recover an OTP it was never handed directly.
  lastCollectRequestFor(vpa: string): UpiCollectRequest | undefined {
    return [...this.collectRequests.values()].reverse().find((request) => request.vpa === vpa);
  }

  // No real signature to check — every other ticket's tests call the webhook
  // route directly without signing anything, same as this fake never having
  // a real webhook secret to compare against.
  verifyWebhookSignature(): boolean {
    return true;
  }
}
