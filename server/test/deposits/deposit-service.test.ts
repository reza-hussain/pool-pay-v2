import { beforeEach, describe, expect, it } from "vitest";
import { DepositService } from "../../src/deposits/deposit-service.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryPendingDepositRepository } from "../../src/deposits/fakes/in-memory-pending-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import {
  InvalidDepositAmountError,
  NotAMemberError,
  PoolNotAcceptingDepositsError,
  UnknownDepositReferenceError,
} from "../../src/deposits/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const pendingDepositRepository = new InMemoryPendingDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const paymentProvider = new FakePaymentProvider();
  const depositService = new DepositService({
    poolRepository,
    membershipRepository,
    depositRepository,
    pendingDepositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
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
    pendingDepositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
    equalSplitPool,
    openPool,
  };
}

// Mirrors the real flow (GET deposit-intent, then confirm) so tests don't
// need to hand-construct a providerRef.
async function deposit(
  depositService: DepositService,
  poolId: string,
  userId: string,
  amountPaise: number,
) {
  const intent = await depositService.createDepositIntent(poolId, userId);
  return depositService.confirmDeposit(intent.id, amountPaise);
}

describe("DepositService.createDepositIntent", () => {
  it("locks the amount for an Equal Split Pool", async () => {
    const { depositService, equalSplitPool } = await makeService();
    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);
    expect(intent.fixedAmountPaise).toBe(100000);
  });

  it("leaves the amount open for an Open Pool", async () => {
    const { depositService, openPool } = await makeService();
    const intent = await depositService.createDepositIntent(openPool.id, MEMBER_ID);
    expect(intent.fixedAmountPaise).toBeNull();
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { depositService } = await makeService();
    await expect(
      depositService.createDepositIntent("does-not-exist", MEMBER_ID),
    ).rejects.toThrow(PoolNotFoundError);
  });
});

describe("DepositService.confirmDeposit", () => {
  it("increases the Pool balance and the Member's contribution total", async () => {
    const { depositService, equalSplitPool } = await makeService();

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 100000);

    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000);
    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary.contributedPaise).toBe(100000);
  });

  it("accepts a shortfall amount for an Equal Split Pool rather than rejecting it", async () => {
    const { depositService, equalSplitPool } = await makeService();

    const result = await deposit(depositService, equalSplitPool.id, MEMBER_ID, 40000);
    expect(result.amountPaise).toBe(40000);

    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary).toEqual({ contributedPaise: 40000, expectedPaise: 100000, shortfallPaise: 60000 });
  });

  it("accepts an overpayment for an Equal Split Pool rather than rejecting it", async () => {
    const { depositService, equalSplitPool } = await makeService();

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 150000);

    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary).toEqual({
      contributedPaise: 150000,
      expectedPaise: 100000,
      shortfallPaise: -50000,
    });
  });

  it("has no expected/shortfall for an Open Pool", async () => {
    const { depositService, openPool } = await makeService();

    await deposit(depositService, openPool.id, MEMBER_ID, 25000);

    const summary = await depositService.getContributionSummary(openPool.id, MEMBER_ID);
    expect(summary).toEqual({ contributedPaise: 25000, expectedPaise: null, shortfallPaise: null });
  });

  it("rejects a non-positive amount", async () => {
    const { depositService, openPool } = await makeService();
    await expect(deposit(depositService, openPool.id, MEMBER_ID, 0)).rejects.toThrow(
      InvalidDepositAmountError,
    );
    await expect(deposit(depositService, openPool.id, MEMBER_ID, -500)).rejects.toThrow(
      InvalidDepositAmountError,
    );
  });

  it("rejects a non-integer amount", async () => {
    const { depositService, openPool } = await makeService();
    await expect(deposit(depositService, openPool.id, MEMBER_ID, 100.5)).rejects.toThrow(
      InvalidDepositAmountError,
    );
  });

  it("rejects an unknown deposit reference", async () => {
    const { depositService } = await makeService();
    await expect(depositService.confirmDeposit("does-not-exist", 1000)).rejects.toThrow(
      UnknownDepositReferenceError,
    );
  });

  it("rejects a deposit from a non-Member", async () => {
    const { depositService, openPool } = await makeService();
    await expect(deposit(depositService, openPool.id, "user_stranger", 1000)).rejects.toThrow(
      NotAMemberError,
    );
  });

  it("rejects a deposit into a Pool that isn't Active", async () => {
    const { depositService, poolRepository, openPool } = await makeService();
    const intent = await depositService.createDepositIntent(openPool.id, MEMBER_ID);
    (await poolRepository.findById(openPool.id))!.state = "LOCKED";

    await expect(depositService.confirmDeposit(intent.id, 1000)).rejects.toThrow(
      PoolNotAcceptingDepositsError,
    );
  });

  it("is idempotent — confirming the same reference twice returns the same Deposit, not a double-credit", async () => {
    const { depositService, equalSplitPool } = await makeService();
    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);

    const first = await depositService.confirmDeposit(intent.id, 100000);
    const second = await depositService.confirmDeposit(intent.id, 100000);

    expect(second.id).toBe(first.id);
    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000);
  });

  it("rejects confirmation scoped to the wrong pool or user", async () => {
    const { depositService, equalSplitPool, openPool } = await makeService();
    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);

    await expect(
      depositService.confirmDeposit(intent.id, 100000, { poolId: openPool.id }),
    ).rejects.toThrow(UnknownDepositReferenceError);
    await expect(
      depositService.confirmDeposit(intent.id, 100000, { userId: "user_stranger" }),
    ).rejects.toThrow(UnknownDepositReferenceError);
  });
});

describe("DepositService.getPoolBalance", () => {
  it("subtracts Spends (amount + fee) from total deposited", async () => {
    const { depositService, spendRepository, openPool } = await makeService();

    await deposit(depositService, openPool.id, MEMBER_ID, 100000);
    await spendRepository.create(openPool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

    expect(await depositService.getPoolBalance(openPool.id)).toBe(100000 - 30000 - 300);
  });

  it("subtracts Reimbursements from total deposited", async () => {
    const { depositService, reimbursementRepository, openPool } = await makeService();

    await deposit(depositService, openPool.id, MEMBER_ID, 100000);
    await reimbursementRepository.create(openPool.id, MEMBER_ID, "member@upi", 20000);

    expect(await depositService.getPoolBalance(openPool.id)).toBe(100000 - 20000);
  });

  it("subtracts Refunds from total deposited", async () => {
    const { depositService, refundRepository, openPool } = await makeService();

    await deposit(depositService, openPool.id, MEMBER_ID, 100000);
    await refundRepository.create(openPool.id, MEMBER_ID, "member@fakebank", 40000);

    expect(await depositService.getPoolBalance(openPool.id)).toBe(100000 - 40000);
  });
});

describe("end-to-end with the fake Payment Provider", () => {
  it("simulates a matching deposit through intent -> confirm -> record", async () => {
    const { depositService, paymentProvider, equalSplitPool } = await makeService();

    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);
    const simulated = paymentProvider.simulateDeposit(intent.id, 100000);
    const deposit = await depositService.confirmDeposit(simulated.providerRef, simulated.amountPaise);

    expect(deposit.amountPaise).toBe(100000);
    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000);
  });

  it("simulates a mismatched deposit and still records it", async () => {
    const { depositService, paymentProvider, equalSplitPool } = await makeService();

    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);
    const simulated = paymentProvider.simulateDeposit(intent.id, 30000);
    const deposit = await depositService.confirmDeposit(simulated.providerRef, simulated.amountPaise);

    expect(deposit.amountPaise).toBe(30000);
    const summary = await depositService.getContributionSummary(equalSplitPool.id, MEMBER_ID);
    expect(summary.shortfallPaise).toBe(70000);
  });
});
