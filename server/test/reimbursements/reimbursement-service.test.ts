import { describe, expect, it } from "vitest";
import { ReimbursementService } from "../../src/reimbursements/reimbursement-service.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import {
  InsufficientPoolBalanceError,
  InvalidReimbursementAmountError,
  MemberHasNoRegisteredUpiIdError,
  RecipientNotAMemberError,
} from "../../src/reimbursements/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";
const MEMBER_UPI_ID = "member@upi";
const STRANGER_ID = "user_stranger";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const userRepository = new InMemoryUserRepository();
  const paymentProvider = new FakePaymentProvider();
  const reimbursementService = new ReimbursementService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
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
  await membershipRepository.create(pool.id, MEMBER_ID, "MEMBER");
  await depositRepository.create(pool.id, MEMBER_ID, 100000);
  userRepository.seedVerifiedUser(MEMBER_ID, "+91member", { upiId: MEMBER_UPI_ID });

  return {
    reimbursementService,
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
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
      30000,
    );

    expect(reimbursement).toMatchObject({
      poolId: pool.id,
      memberId: MEMBER_ID,
      vpa: MEMBER_UPI_ID,
      amountPaise: 30000,
    });
    expect(await reimbursementService.getPoolBalance(pool.id)).toBe(100000 - 30000);
  });

  it("rejects a Reimbursement that would exceed the Pool's current balance", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, 100001),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });

  it("rejects a Reimbursement from a non-Organizer", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, MEMBER_ID, MEMBER_ID, 1000),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects a recipient who isn't a Member of the Pool", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, STRANGER_ID, 1000),
    ).rejects.toThrow(RecipientNotAMemberError);
  });

  it("rejects a Reimbursement into an unknown Pool", async () => {
    const { reimbursementService } = await makeService();

    await expect(
      reimbursementService.recordReimbursement("does-not-exist", ORGANIZER_ID, MEMBER_ID, 1000),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a non-positive amount", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, 0),
    ).rejects.toThrow(InvalidReimbursementAmountError);
  });

  it("rejects a non-integer amount", async () => {
    const { reimbursementService, pool } = await makeService();

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, 100.5),
    ).rejects.toThrow(InvalidReimbursementAmountError);
  });

  it("rejects a Member with no Registered UPI ID on file (ADR 0012)", async () => {
    const { reimbursementService, membershipRepository, pool } = await makeService();
    await membershipRepository.create(pool.id, "user_no_upi", "MEMBER");

    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, "user_no_upi", 1000),
    ).rejects.toThrow(MemberHasNoRegisteredUpiIdError);
  });

  it("accounts for prior Spends and Reimbursements when checking balance", async () => {
    const { reimbursementService, spendRepository, pool } = await makeService();
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 60000, 600);
    // Balance is 100000 - 60000 - 600 = 39400.
    await expect(
      reimbursementService.recordReimbursement(pool.id, ORGANIZER_ID, MEMBER_ID, 40000),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });
});
