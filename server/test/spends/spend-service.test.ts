import { describe, expect, it } from "vitest";
import { SpendService } from "../../src/spends/spend-service.js";
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
import { getMemberBalance } from "../../src/ledger/member-balance.js";
import {
  InvalidMerchantReferenceError,
  InvalidSpendAmountError,
  NotAPoolMemberError,
  SpendUnaffordableByAnyMemberError,
} from "../../src/spends/types.js";
import { PoolClosedError, PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";
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
  userRepository.seedVerifiedUser(MEMBER_ID);
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

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });
  // OPEN Pool here is created directly via poolRepository, bypassing
  // PoolService.createPool — seed both Members' Memberships to match what
  // that would have done, since the equal-split active-Member set now comes
  // from MembershipRepository.listByPool (ADR-0021), not just who deposited.
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
  await membershipRepository.create(pool.id, MEMBER_ID, "MEMBER");
  await depositRepository.create(pool.id, MEMBER_ID, 100000);

  return {
    spendService,
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
    pool,
  };
}

function balanceOf(
  repos: { depositRepository: InMemoryDepositRepository; spendAttributionRepository: InMemorySpendAttributionRepository },
  poolId: string,
  userId: string,
) {
  return getMemberBalance(repos, poolId, userId);
}

describe("SpendService.recordSpend — immediate path (cost within the recorder's own balance)", () => {
  it("deducts the amount plus a 1% fee from the Pool balance", async () => {
    const { spendService, pool } = await makeService();

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 50000);

    expect(result.pendingSpend).toBeNull();
    expect(result.spend).toMatchObject({
      poolId: pool.id,
      userId: MEMBER_ID,
      merchantRef: "merchant@upi",
      amountPaise: 50000,
      feePaise: 500,
    });
    expect(await spendService.getPoolBalance(pool.id)).toBe(100000 - 50000 - 500);
  });

  it("rounds the fee to the nearest paise", async () => {
    const { spendService, pool } = await makeService();

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 333);

    expect(result.spend?.feePaise).toBe(3); // 333 * 0.01 = 3.33 -> 3
  });

  it("lets a non-Organizer Member record a Spend directly (ticket #104)", async () => {
    const { spendService, pool } = await makeService();

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 1000);

    expect(result.spend).not.toBeNull();
    expect(result.spend?.userId).toBe(MEMBER_ID);
  });

  it("executes immediately when the cost exactly equals the recorder's own balance", async () => {
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(MEMBER_ID); // fee waived, keeps the math exact
    // MEMBER_ID's balance is exactly 100000 (from makeService).

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 100000);

    expect(result.pendingSpend).toBeNull();
    expect(result.spend).not.toBeNull();
  });

  it("creates a PendingSpend once the cost exceeds the recorder's own balance by even one paise", async () => {
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(MEMBER_ID); // fee waived, keeps the math exact

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 100001);

    expect(result.spend).toBeNull();
    expect(result.pendingSpend).not.toBeNull();
    expect(result.pendingSpend?.state).toBe("PENDING");
  });

  it("rejects a Spend from a non-Member", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, STRANGER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(NotAPoolMemberError);
  });

  it("rejects a Spend into an unknown Pool", async () => {
    const { spendService } = await makeService();

    await expect(
      spendService.recordSpend("does-not-exist", ORGANIZER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a non-positive amount", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 0),
    ).rejects.toThrow(InvalidSpendAmountError);
    await expect(
      spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", -500),
    ).rejects.toThrow(InvalidSpendAmountError);
  });

  it("rejects a non-integer amount", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 100.5),
    ).rejects.toThrow(InvalidSpendAmountError);
  });

  it("rejects a blank merchant reference", async () => {
    const { spendService, pool } = await makeService();

    await expect(spendService.recordSpend(pool.id, MEMBER_ID, "  ", 1000)).rejects.toThrow(
      InvalidMerchantReferenceError,
    );
  });

  it("creates a PendingSpend once prior Spends erode the recorder's own balance below a subsequent Spend's cost", async () => {
    const { spendService, pool } = await makeService();

    const first = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant-1@upi", 60000);
    expect(first.spend).not.toBeNull();
    // MEMBER_ID's balance is now 100000 - 60600 = 39400. A further 40000
    // spend (plus its 400 fee = 40400) exceeds what's left.
    const second = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant-2@upi", 40000);

    expect(second.spend).toBeNull();
    expect(second.pendingSpend).not.toBeNull();
  });

  it("rejects a Spend from a Closed Pool", async () => {
    const { spendService, poolRepository, pool } = await makeService();
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(
      spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(PoolClosedError);
  });

  it("waives the fee for a subscribed recorder, immediate path", async () => {
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(MEMBER_ID);

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 50000);

    expect(result.spend?.feePaise).toBe(0);
  });

  it("fee waiver follows the recorder's own subscription, not the Organizer's (ticket #104)", async () => {
    const { spendService, userRepository, pool } = await makeService();
    // Organizer is unsubscribed (default); the recording Member is.
    await userRepository.subscribe(MEMBER_ID);

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 50000);

    expect(result.spend?.feePaise).toBe(0);
  });

  it("does not waive the fee for an unsubscribed recorder even when the Organizer is subscribed", async () => {
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID);
    // MEMBER_ID (the recorder) stays unsubscribed.

    const result = await spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 50000);

    expect(result.spend?.feePaise).toBe(500);
  });
});

describe("SpendService.recordSpend — pending path (cost exceeds the recorder's own balance)", () => {
  it("does not move any money or create a Spend row", async () => {
    const { spendService, spendRepository, pool } = await makeService();

    const result = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    expect(result.spend).toBeNull();
    expect(await spendRepository.listByPool(pool.id)).toEqual([]);
  });

  it("stores the amount and the fee computed at proposal time", async () => {
    const { spendService, pool } = await makeService();

    const result = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    expect(result.pendingSpend).toMatchObject({
      poolId: pool.id,
      recorderId: ORGANIZER_ID,
      merchantRef: "merchant@upi",
      amountPaise: 50000,
      feePaise: 500,
      state: "PENDING",
    });
  });

  it("fee waiver follows the recorder's own subscription on the pending path too", async () => {
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID);

    const result = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    expect(result.pendingSpend?.feePaise).toBe(0);
  });

  it("records the recorder's own proposal as an implicit first approval", async () => {
    const { spendService, spendApprovalRepository, pool } = await makeService();

    const result = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    const approvals = await spendApprovalRepository.listByPendingSpend(result.pendingSpend!.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].userId).toBe(ORGANIZER_ID);
  });

  it("re-tallies right after the implicit first approval, surfacing an execution-time affordability failure immediately", async () => {
    // A Pool with only ORGANIZER_ID currently active (MEMBER_ID has left):
    // the recorder's own implicit approval is 1 of 1 eligible approvers —
    // already a majority — so recordSpend's pending branch immediately
    // re-tallies and attempts execution rather than waiting for someone
    // else to approve. With a 0 balance, that execution attempt fails.
    const { spendService, membershipRepository, pendingSpendRepository, pool } = await makeService();
    await membershipRepository.remove(pool.id, MEMBER_ID);

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);

    // The PendingSpend itself was still created and stays PENDING — only
    // the execution attempt failed, not the proposal.
    const pendingSpends = await pendingSpendRepository.listPendingByPool(pool.id);
    expect(pendingSpends).toHaveLength(1);
    expect(pendingSpends[0].state).toBe("PENDING");
  });
});

describe("SpendService.executeSpend equal-split attribution (ADR-0021) — the execution path shared by an immediate Spend and a PendingSpend reaching majority", () => {
  it("splits a Spend equally among active Members who can all afford it", async () => {
    const { spendService, membershipRepository, depositRepository, spendAttributionRepository, pool } =
      await makeService();
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await depositRepository.create(pool.id, ORGANIZER_ID, 100000);
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    // MEMBER_ID (100000) already seeded by makeService — three active
    // Members total, all well-funded.

    // fee = 297 (1% of 29700), total cost = 29997, split 3 ways = 9999 each.
    const spend = await spendService.executeSpend(pool.id, ORGANIZER_ID, "merchant@upi", 29700, 297);

    const attributions = await spendAttributionRepository.listBySpend(spend.id);
    expect(attributions).toHaveLength(3);
    const byMember = Object.fromEntries(attributions.map((a) => [a.memberId, a.amountPaise]));
    expect(byMember[ORGANIZER_ID]).toBe(9999);
    expect(byMember[MEMBER_ID]).toBe(9999);
    expect(byMember[MEMBER_A]).toBe(9999);
  });

  it("excludes a removed Member and a not-yet-joined Member from the split", async () => {
    const {
      spendService,
      membershipRepository,
      depositRepository,
      spendAttributionRepository,
      pool,
    } = await makeService();
    // MEMBER_A was a Member and had money in, but has since been removed —
    // still money in the ledger, but no longer in the active split.
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    await membershipRepository.remove(pool.id, MEMBER_A);
    // MEMBER_B has never joined at all (no Membership row).
    await depositRepository.create(pool.id, ORGANIZER_ID, 100000);

    // fee = 198, total cost = 19998, split between the 2 active Members
    // (ORGANIZER + MEMBER_ID) = 9999 each.
    const spend = await spendService.executeSpend(pool.id, ORGANIZER_ID, "merchant@upi", 19800, 198);

    const attributions = await spendAttributionRepository.listBySpend(spend.id);
    expect(attributions).toHaveLength(2);
    const memberIds = attributions.map((a) => a.memberId).sort();
    expect(memberIds).toEqual([MEMBER_ID, ORGANIZER_ID].sort());
    expect(await spendAttributionRepository.sumByPoolAndMember(pool.id, MEMBER_A)).toBe(0);
    expect(await spendAttributionRepository.sumByPoolAndMember(pool.id, MEMBER_B)).toBe(0);
  });

  it("a single insolvent Member sits out and the rest absorb the full cost", async () => {
    const {
      spendService,
      membershipRepository,
      depositRepository,
      spendAttributionRepository,
      pool,
    } = await makeService();
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await depositRepository.create(pool.id, ORGANIZER_ID, 1000); // can't afford an equal share
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    // MEMBER_ID already has 100000 from makeService.

    // Equal 3-way share would be 10000 each; the Organizer (1000) can't
    // cover that, so the cost re-splits 2 ways: 15000 each.
    const spend = await spendService.executeSpend(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 0);

    const attributions = await spendAttributionRepository.listBySpend(spend.id);
    expect(attributions).toHaveLength(2);
    const byMember = Object.fromEntries(attributions.map((a) => [a.memberId, a.amountPaise]));
    expect(byMember[MEMBER_ID]).toBe(15000);
    expect(byMember[MEMBER_A]).toBe(15000);
    expect(byMember[ORGANIZER_ID]).toBeUndefined();

    const balanceRepos = { depositRepository, spendAttributionRepository };
    await expect(balanceOf(balanceRepos, pool.id, ORGANIZER_ID)).resolves.toBe(1000); // untouched
    await expect(balanceOf(balanceRepos, pool.id, MEMBER_ID)).resolves.toBe(100000 - 15000);
    await expect(balanceOf(balanceRepos, pool.id, MEMBER_A)).resolves.toBe(100000 - 15000);
  });

  it("cascades: excluding one insolvent Member can make another newly unaffordable", async () => {
    const {
      spendService,
      membershipRepository,
      depositRepository,
      spendAttributionRepository,
      pool,
    } = await makeService();
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await membershipRepository.create(pool.id, MEMBER_B, "MEMBER");
    // ORGANIZER: 0 balance (never deposited).
    await depositRepository.create(pool.id, MEMBER_A, 12000);
    await depositRepository.create(pool.id, MEMBER_B, 100000);
    // MEMBER_ID already has 100000 from makeService — 4 active Members total.

    // 4-way equal share = 15000: the Organizer (0) can't afford it and sits
    // out first. Re-split 3 ways among {MEMBER_ID, MEMBER_A, MEMBER_B} =
    // 20000 each: MEMBER_A (12000) now can't afford it either, and sits out
    // too. Final re-split 2 ways among {MEMBER_ID, MEMBER_B} = 30000 each,
    // which both can afford.
    const spend = await spendService.executeSpend(pool.id, ORGANIZER_ID, "merchant@upi", 60000, 0);

    const attributions = await spendAttributionRepository.listBySpend(spend.id);
    expect(attributions).toHaveLength(2);
    const byMember = Object.fromEntries(attributions.map((a) => [a.memberId, a.amountPaise]));
    expect(byMember[MEMBER_ID]).toBe(30000);
    expect(byMember[MEMBER_B]).toBe(30000);
    expect(byMember[ORGANIZER_ID]).toBeUndefined();
    expect(byMember[MEMBER_A]).toBeUndefined();

    const balanceRepos = { depositRepository, spendAttributionRepository };
    await expect(balanceOf(balanceRepos, pool.id, ORGANIZER_ID)).resolves.toBe(0);
    await expect(balanceOf(balanceRepos, pool.id, MEMBER_A)).resolves.toBe(12000); // untouched
  });

  it("throws SpendUnaffordableByAnyMemberError when no Member, alone or together, can cover it", async () => {
    const { spendService, pool } = await makeService();
    // ORGANIZER: 0 balance. MEMBER_ID: 100000 from makeService, but the
    // Spend is bigger than even that.

    await expect(
      spendService.executeSpend(pool.id, ORGANIZER_ID, "merchant@upi", 250000, 0),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);
  });

  it("persists no SpendAttribution rows when a Spend is rejected as unaffordable", async () => {
    const { spendService, spendAttributionRepository, pool } = await makeService();

    await expect(
      spendService.executeSpend(pool.id, ORGANIZER_ID, "merchant@upi", 250000, 0),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);

    expect(await spendAttributionRepository.listByPool(pool.id)).toEqual([]);
  });
});
