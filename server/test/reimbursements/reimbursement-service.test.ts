import { describe, expect, it } from "vitest";
import { ReimbursementService } from "../../src/reimbursements/reimbursement-service.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import {
  InsufficientPoolBalanceError,
  InvalidReimbursementAmountError,
  InvalidVpaError,
  RecipientNotAMemberError,
} from "../../src/reimbursements/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";
const STRANGER_ID = "user_stranger";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const paymentProvider = new FakePaymentProvider();
  const reimbursementService = new ReimbursementService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });
  await membershipRepository.create(pool.id, MEMBER_ID, "MEMBER");
  await depositRepository.create(pool.id, MEMBER_ID, 100000);

  return {
    reimbursementService,
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
    pool,
  };
}

describe("ReimbursementService.recordReimbursement", () => {
  it("deducts the amount from the Pool balance, with no fee", async () => {
    const { reimbursementService, pool } = await makeService();

    const reimbursement = await reimbursementService.recordReimbursement(
      pool.id,
      ORGANIZER_ID,
      MEMBER_ID,
      "member@upi",
      30000,
    );

    expect(reimbursement).toMatchObject({
      poolId: pool.id,
      memberId: MEMBER_ID,
      vpa: "member@upi",
      amountPaise: 30000,
    });
    expect(await reimbursementService.getPoolBalance(pool.id)).toBe(100000 - 30000);
  });

  it("rejects a Reimbursement that would exceed the Pool's current balance", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, "member@upi", 100001),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });

  it("rejects a Reimbursement from a non-Organizer", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, MEMBER_ID, MEMBER_ID, "member@upi", 1000),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects a recipient who isn't a Member of the Pool", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, STRANGER_ID, "stranger@upi", 1000),
    ).rejects.toThrow(RecipientNotAMemberError);
  });

  it("rejects a Reimbursement into an unknown Pool", async () => {
    const { reimbursementService } = await makeService();

    await expect(
      reimbursementService.recordReimbursement("does-not-exist", ORGANIZER_ID, MEMBER_ID, "member@upi", 1000),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a non-positive amount", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, "member@upi", 0),
    ).rejects.toThrow(InvalidReimbursementAmountError);
  });

  it("rejects a non-integer amount", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, "member@upi", 100.5),
    ).rejects.toThrow(InvalidReimbursementAmountError);
  });

  it("rejects a blank UPI ID", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, "  ", 1000),
    ).rejects.toThrow(InvalidVpaError);
  });

  it("accounts for prior Spends and Reimbursements when checking balance", async () => {
    const { reimbursementService, spendRepository, pool } = await makeService();
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 60000, 600);
    // Balance is 100000 - 60000 - 600 = 39400.
    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, "member@upi", 40000),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });
});
