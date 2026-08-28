import { describe, expect, it } from "vitest";
import { SpendService } from "../../src/spends/spend-service.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemorySpendAttributionRepository } from "../../src/spends/fakes/in-memory-spend-attribution-repository.js";
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
  SpendUnaffordableByAnyMemberError,
} from "../../src/spends/types.js";
import { PoolClosedError, PoolNotFoundError } from "../../src/memberships/types.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const spendAttributionRepository = new InMemorySpendAttributionRepository();
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

describe("SpendService.recordSpend", () => {
  it("deducts the amount plus a 1% fee from the Pool balance", async () => {
    const { spendService, pool } = await makeService();

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    expect(spend.amountPaise).toBe(50000);
    expect(spend.feePaise).toBe(500);
    expect(spend.merchantRef).toBe("merchant@upi");
    expect(await spendService.getPoolBalance(pool.id)).toBe(100000 - 50000 - 500);
  });

  it("rounds the fee to the nearest paise", async () => {
    const { spendService, pool } = await makeService();

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 333);

    expect(spend.feePaise).toBe(3); // 333 * 0.01 = 3.33 -> 3
  });

  it("rejects a Spend that not even the smallest paying group could cover", async () => {
    const { spendService, pool } = await makeService();

    // Only MEMBER_ID has any balance (100000); an amount larger than that
    // can't be covered even by MEMBER_ID alone once the insolvent Organizer
    // sits out.
    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 100000),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);
  });

  it("rejects a Spend from a non-Organizer", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(NotPoolOrganizerError);
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
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 0),
    ).rejects.toThrow(InvalidSpendAmountError);
    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", -500),
    ).rejects.toThrow(InvalidSpendAmountError);
  });

  it("rejects a non-integer amount", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 100.5),
    ).rejects.toThrow(InvalidSpendAmountError);
  });

  it("rejects a blank merchant reference", async () => {
    const { spendService, pool } = await makeService();

    await expect(spendService.recordSpend(pool.id, ORGANIZER_ID, "  ", 1000)).rejects.toThrow(
      InvalidMerchantReferenceError,
    );
  });

  it("accounts for prior Spends when checking balance for a subsequent Spend", async () => {
    const { spendService, pool } = await makeService();

    await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant-1@upi", 60000);
    // MEMBER_ID's balance is now 100000 - 60600 = 39400 (the insolvent
    // Organizer sat out entirely). A further 40000 spend (plus its fee)
    // exceeds what's left, and the Organizer still can't help cover it.
    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant-2@upi", 40000),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);
  });

  it("rejects a Spend from a Closed Pool", async () => {
    const { spendService, poolRepository, pool } = await makeService();
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(PoolClosedError);
  });

  it("waives the fee for a subscribed Organizer (ticket #13)", async () => {
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID);

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    expect(spend.feePaise).toBe(0);
  });
});

describe("SpendService.recordSpend equal-split attribution (ADR-0021)", () => {
  it("splits a Spend equally among active Members who can all afford it", async () => {
    const { spendService, membershipRepository, depositRepository, spendAttributionRepository, pool } =
      await makeService();
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await depositRepository.create(pool.id, ORGANIZER_ID, 100000);
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    // MEMBER_ID (100000) already seeded by makeService — three active
    // Members total, all well-funded.

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 29700);
    // fee = 297, total cost = 29997, split 3 ways = 9999 each.

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
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    // MEMBER_A was a Member and had money in, but has since been removed —
    // still money in the ledger, but no longer in the active split.
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    await membershipRepository.remove(pool.id, MEMBER_A);
    // MEMBER_B has never joined at all (no Membership row).
    await depositRepository.create(pool.id, ORGANIZER_ID, 100000);

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 19800);
    // fee = 198, total cost = 19998, split between the 2 active Members
    // (ORGANIZER + MEMBER_ID) = 9999 each.

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
      userRepository,
      membershipRepository,
      depositRepository,
      spendAttributionRepository,
      pool,
    } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID); // fee waived, keeps the math clean
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await depositRepository.create(pool.id, ORGANIZER_ID, 1000); // can't afford an equal share
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    // MEMBER_ID already has 100000 from makeService.

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 30000);
    // Equal 3-way share would be 10000 each; the Organizer (1000) can't
    // cover that, so the cost re-splits 2 ways: 15000 each.

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
      userRepository,
      membershipRepository,
      depositRepository,
      spendAttributionRepository,
      pool,
    } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID); // fee waived
    await membershipRepository.create(pool.id, MEMBER_A, "MEMBER");
    await membershipRepository.create(pool.id, MEMBER_B, "MEMBER");
    // ORGANIZER: 0 balance (never deposited).
    await depositRepository.create(pool.id, MEMBER_A, 12000);
    await depositRepository.create(pool.id, MEMBER_B, 100000);
    // MEMBER_ID already has 100000 from makeService — 4 active Members total.

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 60000);
    // 4-way equal share = 15000: the Organizer (0) can't afford it and sits
    // out first. Re-split 3 ways among {MEMBER_ID, MEMBER_A, MEMBER_B} =
    // 20000 each: MEMBER_A (12000) now can't afford it either, and sits out
    // too. Final re-split 2 ways among {MEMBER_ID, MEMBER_B} = 30000 each,
    // which both can afford.

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
    const { spendService, userRepository, pool } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID); // fee waived
    // ORGANIZER: 0 balance. MEMBER_ID: 100000 from makeService, but the
    // Spend is bigger than even that.

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 250000),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);
  });

  it("persists no SpendAttribution rows when a Spend is rejected as unaffordable", async () => {
    const { spendService, userRepository, spendAttributionRepository, pool } =
      await makeService();
    await userRepository.subscribe(ORGANIZER_ID);

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 250000),
    ).rejects.toThrow(SpendUnaffordableByAnyMemberError);

    expect(await spendAttributionRepository.listByPool(pool.id)).toEqual([]);
  });
});
