import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";

describe("FakePaymentProvider.createDepositIntent", () => {
  it("returns an intent with the given fixed amount for an Equal Split Pool", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000, "+919876543210");

    expect(intent.poolId).toBe("pool_1");
    expect(intent.fixedAmountPaise).toBe(100000);
    expect(intent.vpa).toBeTruthy();
    expect(intent.id).toBeTruthy();
  });

  it("returns an intent with no fixed amount for an Open Pool", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", null, "+919876543210");

    expect(intent.fixedAmountPaise).toBeNull();
  });
});

describe("FakePaymentProvider.simulateDeposit", () => {
  it("simulates a deposit matching the intent's fixed amount", async () => {
    const provider = new FakePaymentProvider();
    const intent = await provider.createDepositIntent("pool_1", 100000, "+919876543210");

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
    const intent = await provider.createDepositIntent("pool_1", 100000, "+919876543210");

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
    const intent = await provider.createDepositIntent("pool_1", 100000, "+919876543210");

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

describe("FakePaymentProvider.initiateUpiOwnershipCollectRequest", () => {
  it("returns a collect request for the given vpa and amount", async () => {
    const provider = new FakePaymentProvider();

    const request = await provider.initiateUpiOwnershipCollectRequest("asha.rao@upi", 100, "user_asha", "+919876543210");

    expect(request).toMatchObject({ vpa: "asha.rao@upi", amountPaise: 100 });
    expect(request.id).toBeTruthy();
  });
});

describe("FakePaymentProvider.simulateOwnershipConfirmation", () => {
  it("simulates confirmation of a known collect request", async () => {
    const provider = new FakePaymentProvider();
    const request = await provider.initiateUpiOwnershipCollectRequest("asha.rao@upi", 100, "user_asha", "+919876543210");

    const simulated = provider.simulateOwnershipConfirmation(request.id, 100);

    expect(simulated).toEqual({ providerRef: request.id, amountPaise: 100, status: "SUCCESS" });
  });

  it("throws for an unknown collect request id", () => {
    const provider = new FakePaymentProvider();
    expect(() => provider.simulateOwnershipConfirmation("does-not-exist", 100)).toThrow();
  });
});

describe("FakePaymentProvider.lastCollectRequestFor", () => {
  it("returns the most recently raised collect request for a vpa", async () => {
    const provider = new FakePaymentProvider();
    await provider.initiateUpiOwnershipCollectRequest("asha.rao@upi", 100, "user_asha", "+919876543210");
    const second = await provider.initiateUpiOwnershipCollectRequest("asha.rao@upi", 100, "user_asha", "+919876543210");

    expect(provider.lastCollectRequestFor("asha.rao@upi")?.id).toBe(second.id);
  });

  it("returns undefined when no collect request was raised for that vpa", () => {
    const provider = new FakePaymentProvider();
    expect(provider.lastCollectRequestFor("nobody@upi")).toBeUndefined();
  });
});

describe("FakePaymentProvider.refundUpiOwnershipCollectRequest", () => {
  it("returns a refund confirmation id", async () => {
    const provider = new FakePaymentProvider();
    const refund = await provider.refundUpiOwnershipCollectRequest("asha.rao@upi", 100);
    expect(refund.id).toBeTruthy();
  });
});

describe("FakePaymentProvider.verifyVpa", () => {
  it("verifies a well-formed VPA and derives an account holder name from it", async () => {
    const provider = new FakePaymentProvider();

    const result = await provider.verifyVpa("asha.rao@upi");

    expect(result).toEqual({ verified: true, accountHolderName: "Asha Rao" });
  });

  it("rejects a VPA with no @ handle", async () => {
    const provider = new FakePaymentProvider();

    const result = await provider.verifyVpa("not-a-vpa");

    expect(result).toEqual({ verified: false, accountHolderName: null });
  });
});
