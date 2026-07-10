import { describe, expect, it } from "vitest";
import { VoteService } from "../../src/votes/vote-service.js";
import { InMemoryRefundVoteRepository } from "../../src/votes/fakes/in-memory-refund-vote-repository.js";
import { AlreadyVotedError, NotAPoolMemberError, OrganizerCannotVoteError } from "../../src/votes/types.js";
import { ClosureService } from "../../src/closure/closure-service.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
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
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const refundVoteRepository = new InMemoryRefundVoteRepository();
  const paymentProvider = new FakePaymentProvider();
  const closureService = new ClosureService({
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
  });
  const voteService = new VoteService({
    poolRepository,
    membershipRepository,
    refundVoteRepository,
    closureService,
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
  await depositRepository.create(pool.id, MEMBER_A, 30000);

  return { voteService, poolRepository, membershipRepository, depositRepository, spendRepository, pool };
}

describe("VoteService.castVote", () => {
  it("does not close the Pool below a majority", async () => {
    const { voteService, pool } = await makeService();

    const result = await voteService.castVote(pool.id, MEMBER_A);

    expect(result.closure).toBeNull();
    expect(result.status.votesCast).toBe(1);
    expect(result.status.eligibleVoterCount).toBe(3);
    expect(result.status.poolState).toBe("ACTIVE");
  });

  it("closes the Pool the moment votes exceed 50% of non-Organizer Members", async () => {
    const { voteService, pool } = await makeService();
    await voteService.castVote(pool.id, MEMBER_A);

    const result = await voteService.castVote(pool.id, MEMBER_B);

    expect(result.closure).not.toBeNull();
    expect(result.closure?.pool.state).toBe("CLOSED");
    expect(result.status.poolState).toBe("CLOSED");
  });

  it("refunds the remaining balance pro-rata when the vote succeeds", async () => {
    const { voteService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_B, 70000);
    await voteService.castVote(pool.id, MEMBER_A);

    const result = await voteService.castVote(pool.id, MEMBER_B);

    expect(result.closure?.refundTotalPaise).toBe(100000);
  });

  it("does not claw back money already Spent before the vote", async () => {
    const { voteService, depositRepository, spendRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_B, 70000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 20000, 200);
    await voteService.castVote(pool.id, MEMBER_A);

    const result = await voteService.castVote(pool.id, MEMBER_B);

    expect(result.closure?.refundTotalPaise).toBe(100000 - 20000 - 200);
  });

  it("does not count the Organizer as an eligible voter", async () => {
    const { voteService, pool } = await makeService();

    await expect(voteService.castVote(pool.id, ORGANIZER_ID)).rejects.toThrow(
      OrganizerCannotVoteError,
    );
  });

  it("rejects a second vote from the same Member", async () => {
    const { voteService, pool } = await makeService();
    await voteService.castVote(pool.id, MEMBER_A);

    await expect(voteService.castVote(pool.id, MEMBER_A)).rejects.toThrow(AlreadyVotedError);
  });

  it("rejects a vote from a non-Member", async () => {
    const { voteService, pool } = await makeService();

    await expect(voteService.castVote(pool.id, STRANGER_ID)).rejects.toThrow(NotAPoolMemberError);
  });

  it("rejects a vote on an unknown Pool", async () => {
    const { voteService } = await makeService();

    await expect(voteService.castVote("does-not-exist", MEMBER_A)).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("rejects a vote on an already-Closed Pool", async () => {
    const { voteService, poolRepository, pool } = await makeService();
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(voteService.castVote(pool.id, MEMBER_A)).rejects.toThrow(PoolClosedError);
  });
});

describe("VoteService.getVoteStatus", () => {
  it("reports the tally and whether the caller has voted", async () => {
    const { voteService, pool } = await makeService();
    await voteService.castVote(pool.id, MEMBER_A);

    const statusForVoter = await voteService.getVoteStatus(pool.id, MEMBER_A);
    const statusForNonVoter = await voteService.getVoteStatus(pool.id, MEMBER_B);

    expect(statusForVoter).toMatchObject({ votesCast: 1, eligibleVoterCount: 3, hasVoted: true });
    expect(statusForNonVoter).toMatchObject({ votesCast: 1, eligibleVoterCount: 3, hasVoted: false });
  });

  it("rejects a non-Member", async () => {
    const { voteService, pool } = await makeService();

    await expect(voteService.getVoteStatus(pool.id, STRANGER_ID)).rejects.toThrow(
      NotAPoolMemberError,
    );
  });

  it("rejects an unknown Pool", async () => {
    const { voteService } = await makeService();

    await expect(voteService.getVoteStatus("does-not-exist", MEMBER_A)).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});
