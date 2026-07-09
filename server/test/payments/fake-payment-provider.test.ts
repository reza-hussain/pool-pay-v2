import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";

describe("FakePaymentProvider.createDepositIntent", () => {
  it("returns an intent with the given fixed amount for an Equal Split Pool", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000);

    expect(intent.poolId).toBe("pool_1");
    expect(intent.fixedAmountPaise).toBe(100000);
    expect(intent.vpa).toBeTruthy();
    expect(intent.id).toBeTruthy();
  });

  it("returns an intent with no fixed amount for an Open Pool", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", null);

    expect(intent.fixedAmountPaise).toBeNull();
  });
});

describe("FakePaymentProvider.simulateDeposit", () => {
  it("simulates a deposit matching the intent's fixed amount", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000);

    const simulated = provider.simulateDeposit(intent.id, 100000);

    expect(simulated).toEqual({ poolId: "pool_1", amountPaise: 100000 });
  });

  it("simulates a deposit that mismatches the intent's fixed amount", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000);

    const simulated = provider.simulateDeposit(intent.id, 75000);

    expect(simulated).toEqual({ poolId: "pool_1", amountPaise: 75000 });
  });

  it("throws for an unknown intent id", () => {
    const provider = new FakePaymentProvider();
    expect(() => provider.simulateDeposit("does-not-exist", 1000)).toThrow();
  });
});
