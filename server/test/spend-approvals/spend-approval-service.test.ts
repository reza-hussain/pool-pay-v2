import { describe, expect, it } from "vitest";
import { SpendService } from "../../src/spends/spend-service.js";
import { SpendApprovalService } from "../../src/spend-approvals/spend-approval-service.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemorySpendAttributionRepository } from "../../src/spends/fakes/in-memory-spend-attribution-repository.js";
import { InMemoryPendingSpendRepository } from "../../src/spend-approvals/fakes/in-memory-pending-spend-repository.js";
import { InMemorySpendApprovalRepository } from "../../src/spend-approvals/fakes/in-memory-spend-approval-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { NotAPoolMemberError, PendingSpendNotFoundError } from "../../src/spend-approvals/types.js";
import { SpendUnaffordableByAnyMemberError } from "../../src/spends/types.js";
import { PoolClosedError, PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";
const MEMBER_C = "user_member_c";
const STRANGER_ID = "user_stranger";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const spendAttributionRepository = new InMemorySpendAttributionRepository();
  const pendingSpendRepository = new InMemoryPendingSpendRepository();
  const spendApprovalRepository = new InMemorySpendApprovalRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  const paymentProvider = new FakePaymentProvider();
  const spendService = new SpendService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    spendAttributionRepository,
    pendingSpendRepository,
    spendApprovalRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
  });
  const spendApprovalService = new SpendApprovalService({
    poolRepository,
    membershipRepository,
    pendingSpendRepository,
    spendApprovalRepository,
    spendService,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
  await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
  await membershipRepository.create(pool.id, MEMBER_B, "MEMBER");
  await membershipRepository.create(pool.id, MEMBER_C, "MEMBER");
  // Everyone well-funded by default; individual tests trim this down to
  // exercise the insolvency-sit-out path at execution time.
  await depositRepository.create(pool.id, ORGANIZER_ID, 100000);
  await depositRepository.create(pool.id, MEMBER_A, 100000);
  await depositRepository.create(pool.id, MEMBER_B, 100000);
  await depositRepository.create(pool.id, MEMBER_C, 100000);

  return {
    spendService,
    spendApprovalService,
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    spendAttributionRepository,
    pendingSpendRepository,
    spendApprovalRepository,
    userRepository,
    pool,
  };
}

// A Pool-wide Spend big enough that no single Member's own balance covers it
// (4 active Members * 100000 each), forcing the pending path.
const BIG_SPEND_AMOUNT = 250000;

describe("SpendApprovalService.approve", () => {
  it("is idempotent for a repeat approval from the same Member", async () => {
    const { spendService, spendApprovalService, spendApprovalRepository, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);

    await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);
    await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);

    const approvals = await spendApprovalRepository.listByPendingSpend(pendingSpend!.id);
    expect(approvals.filter((a) => a.userId === MEMBER_A)).toHaveLength(1);
  });

  it("does not execute below a majority of the Pool's currently active Members", async () => {
    const { spendService, spendApprovalService, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    // 4 eligible approvers (ORGANIZER + 3 Members); ORGANIZER's own proposal
    // is 1 implicit approval — not yet a majority.

    const result = await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);

    expect(result.executedSpend).toBeNull();
    expect(result.status.approvalsCount).toBe(2);
    expect(result.status.eligibleApproverCount).toBe(4);
  });

  it("executes the moment approvals exceed 50% of currently active Members, producing the same Spend/SpendAttribution shape as an immediate Spend", async () => {
    const { spendService, spendApprovalService, spendRepository, spendAttributionRepository, pool } =
      await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);

    // 2 of 4 approved so far (ORGANIZER implicit + MEMBER_A) — 2*2=4, not >4.
    // A third approval clears it: 3*2=6 > 4.
    const result = await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_B);

    expect(result.executedSpend).not.toBeNull();
    expect(result.executedSpend?.amountPaise).toBe(BIG_SPEND_AMOUNT);
    const spend = await spendRepository.listByPool(pool.id);
    expect(spend).toHaveLength(1);
    expect(spend[0].id).toBe(result.executedSpend!.id);

    // Split 4 ways among the currently active Members, exactly like an
    // immediate Spend's attribution (ADR-0021).
    const attributions = await spendAttributionRepository.listBySpend(result.executedSpend!.id);
    expect(attributions).toHaveLength(4);

    // The PendingSpend itself is marked EXECUTED and points at the result.
    expect(result.status.pendingSpend.state).toBe("EXECUTED");
    expect(result.status.pendingSpend.resultingSpendId).toBe(result.executedSpend!.id);
  });

  it("excludes a Member who left the Pool between proposal and a would-be majority from both the eligible count and the split", async () => {
    const { spendService, spendApprovalService, membershipRepository, spendAttributionRepository, pool } =
      await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    // MEMBER_C leaves before anyone else approves — now only 3 currently
    // active Members (ORGANIZER, MEMBER_A, MEMBER_B), so ORGANIZER's
    // implicit approval + one more is already a majority (2*2=4 > 3).
    await membershipRepository.remove(pool.id, MEMBER_C);

    const result = await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);

    expect(result.executedSpend).not.toBeNull();
    expect(result.status.eligibleApproverCount).toBe(3);
    const attributions = await spendAttributionRepository.listBySpend(result.executedSpend!.id);
    expect(attributions.map((a) => a.memberId).sort()).toEqual([MEMBER_A, ORGANIZER_ID, MEMBER_B].sort());
    expect(attributions.find((a) => a.memberId === MEMBER_C)).toBeUndefined();
  });

  it("throws SpendUnaffordableByAnyMemberError if nobody can afford it by the time majority is reached", async () => {
    const { spendService, spendApprovalService, depositRepository, spendAttributionRepository, pool } =
      await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);
    // Between proposal and the majority-clearing approval, every active
    // Member's balance gets spent down elsewhere via a direct attribution.
    for (const memberId of [ORGANIZER_ID, MEMBER_A, MEMBER_B, MEMBER_C]) {
      await depositRepository.create(pool.id, memberId, -99999); // net down to 1 each
    }

    await expect(spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_B)).rejects.toThrow(
      SpendUnaffordableByAnyMemberError,
    );
    expect(await spendAttributionRepository.listByPool(pool.id)).toEqual([]);
  });

  it("rejects an approval from a non-Member", async () => {
    const { spendService, spendApprovalService, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);

    await expect(
      spendApprovalService.approve(pendingSpend!.id, pool.id, STRANGER_ID),
    ).rejects.toThrow(NotAPoolMemberError);
  });

  it("rejects an approval on an unknown PendingSpend", async () => {
    const { spendApprovalService, pool } = await makeService();

    await expect(
      spendApprovalService.approve("does-not-exist", pool.id, MEMBER_A),
    ).rejects.toThrow(PendingSpendNotFoundError);
  });

  it("rejects an approval scoped to the wrong Pool", async () => {
    const { spendService, spendApprovalService, poolRepository, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    const otherPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Other Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "222222",
    });

    await expect(
      spendApprovalService.approve(pendingSpend!.id, otherPool.id, MEMBER_A),
    ).rejects.toThrow(PendingSpendNotFoundError);
  });

  it("rejects an approval on a Closed Pool", async () => {
    const { spendService, spendApprovalService, poolRepository, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(
      spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A),
    ).rejects.toThrow(PoolClosedError);
  });
});

describe("SpendApprovalService.getStatus", () => {
  it("reports the tally and whether the caller has approved", async () => {
    const { spendService, spendApprovalService, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);
    await spendApprovalService.approve(pendingSpend!.id, pool.id, MEMBER_A);

    const statusForApprover = await spendApprovalService.getStatus(pendingSpend!.id, pool.id, MEMBER_A);
    const statusForNonApprover = await spendApprovalService.getStatus(pendingSpend!.id, pool.id, MEMBER_B);

    expect(statusForApprover).toMatchObject({ approvalsCount: 2, eligibleApproverCount: 4, hasApproved: true });
    expect(statusForNonApprover).toMatchObject({ approvalsCount: 2, eligibleApproverCount: 4, hasApproved: false });
  });

  it("rejects a non-Member", async () => {
    const { spendService, spendApprovalService, pool } = await makeService();
    const { pendingSpend } = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", BIG_SPEND_AMOUNT);

    await expect(
      spendApprovalService.getStatus(pendingSpend!.id, pool.id, STRANGER_ID),
    ).rejects.toThrow(NotAPoolMemberError);
  });

  it("rejects an unknown PendingSpend", async () => {
    const { spendApprovalService, pool } = await makeService();

    await expect(
      spendApprovalService.getStatus("does-not-exist", pool.id, ORGANIZER_ID),
    ).rejects.toThrow(PendingSpendNotFoundError);
  });
});

describe("SpendApprovalService.listPending", () => {
  it("lists only currently-PENDING PendingSpends for the Pool", async () => {
    const { spendService, spendApprovalService, pool } = await makeService();
    const { pendingSpend: stillPending } = await spendService.recordSpend(
      pool.id,
      ORGANIZER_ID,
      "merchant-1@upi",
      BIG_SPEND_AMOUNT,
    );
    const { pendingSpend: aboutToExecute } = await spendService.recordSpend(
      pool.id,
      ORGANIZER_ID,
      "merchant-2@upi",
      BIG_SPEND_AMOUNT,
    );
    await spendApprovalService.approve(aboutToExecute!.id, pool.id, MEMBER_A);
    await spendApprovalService.approve(aboutToExecute!.id, pool.id, MEMBER_B); // clears majority

    const pending = await spendApprovalService.listPending(pool.id, MEMBER_A);

    expect(pending).toHaveLength(1);
    expect(pending[0].pendingSpend.id).toBe(stillPending!.id);
  });

  it("rejects a non-Member", async () => {
    const { spendApprovalService, pool } = await makeService();

    await expect(spendApprovalService.listPending(pool.id, STRANGER_ID)).rejects.toThrow(
      NotAPoolMemberError,
    );
  });

  it("rejects an unknown Pool", async () => {
    const { spendApprovalService } = await makeService();

    await expect(spendApprovalService.listPending("does-not-exist", ORGANIZER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});
