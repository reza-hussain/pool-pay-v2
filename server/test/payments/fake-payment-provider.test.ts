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

    expect(simulated).toEqual({
      poolId: "pool_1",
      providerRef: intent.id,
      amountPaise: 100000,
      status: "SUCCESS",
    });
  });

  it("simulates a deposit that mismatches the intent's fixed amount", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000);

    const simulated = provider.simulateDeposit(intent.id, 75000);

    expect(simulated).toEqual({
      poolId: "pool_1",
      providerRef: intent.id,
      amountPaise: 75000,
      status: "SUCCESS",
    });
  });

  it("throws for an unknown intent id", () => {
    const provider = new FakePaymentProvider();
    expect(() => provider.simulateDeposit("does-not-exist", 1000)).toThrow();
  });
});

describe("FakePaymentProvider.parseDepositWebhook", () => {
  it("passes through a well-formed event", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000);

    const event = provider.parseDepositWebhook({
      providerRef: intent.id,
      amountPaise: 100000,
      status: "SUCCESS",
    });

    expect(event).toEqual({ providerRef: intent.id, amountPaise: 100000, status: "SUCCESS" });
  });

  it("returns null for an unrecognized payload", () => {
    const provider = new FakePaymentProvider();
    expect(provider.parseDepositWebhook({ foo: "bar" })).toBeNull();
    expect(provider.parseDepositWebhook(null)).toBeNull();
    expect(provider.parseDepositWebhook("not an object")).toBeNull();
  });
});

describe("FakePaymentProvider.initiateSpend", () => {
  it("confirms the Spend instantly with the given merchant reference and amount", async () => {
    const provider = new FakePaymentProvider();

    const confirmation = await provider.initiateSpend("pool_1", "merchant@upi", 50000);

    expect(confirmation).toMatchObject({
      poolId: "pool_1",
      merchantRef: "merchant@upi",
      amountPaise: 50000,
    });
    expect(confirmation.id).toBeTruthy();
  });
});

describe("FakePaymentProvider.initiateTransfer", () => {
  it("confirms the transfer instantly with the given VPA and amount", async () => {
    const provider = new FakePaymentProvider();

    const confirmation = await provider.initiateTransfer("pool_1", "member@upi", 25000);

    expect(confirmation).toMatchObject({
      poolId: "pool_1",
      vpa: "member@upi",
      amountPaise: 25000,
    });
    expect(confirmation.id).toBeTruthy();
  });
});
