import type { DepositIntent, PaymentProvider } from "../types.js";

let nextId = 1;

export interface SimulatedDeposit {
  poolId: string;
  amountPaise: number;
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
  // since not every UPI app honors a locked amount.
  simulateDeposit(intentId: string, amountPaise: number): SimulatedDeposit {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Unknown deposit intent: ${intentId}`);
    }
    return { poolId: intent.poolId, amountPaise };
  }
}
