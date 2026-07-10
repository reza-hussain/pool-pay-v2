import type {
  DepositIntent,
  DepositWebhookEvent,
  PaymentProvider,
  SpendConfirmation,
  TransferConfirmation,
} from "../types.js";

let nextId = 1;

export interface SimulatedDeposit extends DepositWebhookEvent {
  poolId: string;
}

export class FakePaymentProvider implements PaymentProvider {
  private intents = new Map<string, DepositIntent>();

  async createDepositIntent(
    poolId: string,
    fixedAmountPaise: number | null,
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
  // provider-specific shape to normalize, unlike the real Decentro adapter.
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
}
