import { beforeEach, describe, expect, it } from "vitest";
import { DepositService } from "../../src/deposits/deposit-service.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { InvalidDepositAmountError, NotAMemberError, PoolNotAcceptingDepositsError } from "../../src/deposits/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const paymentProvider = new FakePaymentProvider();
  const depositService = new DepositService({
    poolRepository,
    membershipRepository,
    depositRepository,
    paymentProvider,
  });

  const equalSplitPool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "EQUAL_SPLIT",
    perPersonAmountPaise: 100000,
    joinCode: "111111",
  });
  const openPool = await poolRepository.create(ORGANIZER_ID, {
    name: "Flat 3B Rent",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "222222",
  });
  await membershipRepository.create(equalSplitPool.id, MEMBER_ID, "MEMBER");
  await membershipRepository.create(openPool.id, MEMBER_ID, "MEMBER");

  return {
    depositService,
    poolRepository,
    membershipRepository,
    depositRepository,
    paymentProvider,
    equalSplitPool,
    openPool,
  };
}

describe("DepositService.createDepositIntent", () => {
  it("locks the amount for an Equal Split Pool", async () => {
    const { depositService, equalSplitPool } = await makeService();
    const intent = await depositService.createDepositIntent(equalSplitPool.id);
    expect(intent.fixedAmountPaise).toBe(100000);
  });

  it("leaves the amount open for an Open Pool", async () => {
    const { depositService, openPool } = await makeService();
    const intent = await depositService.createDepositIntent(openPool.id);
    expect(intent.fixedAmountPaise).toBeNull();
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { depositService } = await makeService();
    await expect(depositService.createDepositIntent("does-not-exist")).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});

describe("DepositService.recordDeposit", () => {
  it("increases the Pool balance and the Member's contribution total", async () => {
    const { depositService, equalSplitPool } = await makeService();

    await depositService.recordDeposit(equalSplitPool.id, MEMBER_ID, 100000);

    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000);
    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary.contributedPaise).toBe(100000);
  });

  it("accepts a shortfall amount for an Equal Split Pool rather than rejecting it", async () => {
    const { depositService, equalSplitPool } = await makeService();

    const deposit = await depositService.recordDeposit(equalSplitPool.id, MEMBER_ID, 40000);
    expect(deposit.amountPaise).toBe(40000);

    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary).toEqual({ contributedPaise: 40000, expectedPaise: 100000, shortfallPaise: 60000 });
  });

  it("accepts an overpayment for an Equal Split Pool rather than rejecting it", async () => {
    const { depositService, equalSplitPool } = await makeService();

    await depositService.recordDeposit(equalSplitPool.id, MEMBER_ID, 150000);

    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary).toEqual({
      contributedPaise: 150000,
      expectedPaise: 100000,
      shortfallPaise: -50000,
    });
  });

  it("has no expected/shortfall for an Open Pool", async () => {
    const { depositService, openPool } = await makeService();

    await depositService.recordDeposit(openPool.id, MEMBER_ID, 25000);

    const summary = await depositService.getContributionSummary(openPool.id, MEMBER_ID);
    expect(summary).toEqual({ contributedPaise: 25000, expectedPaise: null, shortfallPaise: null });
  });

  it("rejects a non-positive amount", async () => {
    const { depositService, openPool } = await makeService();
    await expect(depositService.recordDeposit(openPool.id, MEMBER_ID, 0)).rejects.toThrow(
      InvalidDepositAmountError,
    );
    await expect(depositService.recordDeposit(openPool.id, MEMBER_ID, -500)).rejects.toThrow(
      InvalidDepositAmountError,
    );
  });

  it("rejects a non-integer amount", async () => {
    const { depositService, openPool } = await makeService();
    await expect(depositService.recordDeposit(openPool.id, MEMBER_ID, 100.5)).rejects.toThrow(
      InvalidDepositAmountError,
    );
  });

  it("rejects a deposit into an unknown pool", async () => {
    const { depositService } = await makeService();
    await expect(
      depositService.recordDeposit("does-not-exist", MEMBER_ID, 1000),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a deposit from a non-Member", async () => {
    const { depositService, openPool } = await makeService();
    await expect(
      depositService.recordDeposit(openPool.id, "user_stranger", 1000),
    ).rejects.toThrow(NotAMemberError);
  });

  it("rejects a deposit into a Pool that isn't Active", async () => {
    const { depositService, poolRepository, openPool } = await makeService();
    (await poolRepository.findById(openPool.id))!.state = "LOCKED";

    await expect(
      depositService.recordDeposit(openPool.id, MEMBER_ID, 1000),
    ).rejects.toThrow(PoolNotAcceptingDepositsError);
  });
});

describe("end-to-end with the fake Payment Provider", () => {
  it("simulates a matching deposit through intent -> confirm -> record", async () => {
    const { depositService, paymentProvider, equalSplitPool } = await makeService();

    const intent = await depositService.createDepositIntent(equalSplitPool.id);
    const simulated = paymentProvider.simulateDeposit(intent.id, 100000);
    const deposit = await depositService.recordDeposit(
      simulated.poolId,
      MEMBER_ID,
      simulated.amountPaise,
    );

    expect(deposit.amountPaise).toBe(100000);
    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000);
  });

  it("simulates a mismatched deposit and still records it", async () => {
    const { depositService, paymentProvider, equalSplitPool } = await makeService();

    const intent = await depositService.createDepositIntent(equalSplitPool.id);
    const simulated = paymentProvider.simulateDeposit(intent.id, 30000);
    const deposit = await depositService.recordDeposit(
      simulated.poolId,
      MEMBER_ID,
      simulated.amountPaise,
    );

    expect(deposit.amountPaise).toBe(30000);
    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary.shortfallPaise).toBe(70000);
  });
});
