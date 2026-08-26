import { describe, expect, it } from "vitest";
import { ClosureService, computeRefunds } from "../../src/closure/closure-service.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { PoolAlreadyClosedError } from "../../src/closure/types.js";
import { MemberHasNoRegisteredUpiIdError } from "../../src/reimbursements/types.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryInvitationRepository } from "../../src/invitations/fakes/in-memory-invitation-repository.js";
import { JoinRequestService } from "../../src/join-requests/join-request-service.js";
import { InMemoryJoinRequestRepository } from "../../src/join-requests/fakes/in-memory-join-request-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";
const STRANGER_ID = "user_stranger";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const userRepository = new InMemoryUserRepository();
  const paymentProvider = new FakePaymentProvider();
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });
  const closureService = new ClosureService({
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
    notificationService,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });

  return {
    closureService,
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
    notificationRepository,
    pool,
  };
}

// Onboarding (ADR 0012) is mandatory before a person can join or deposit
// into any Pool, so every Member Closure processes is expected to have a
// Registered UPI ID — seed one here the same way a real Member would have
// one by the time they've joined a Pool.
function seedUpi(userRepository: InMemoryUserRepository, memberId: string) {
  userRepository.seedVerifiedUser(memberId, undefined, { upiId: `${memberId}@upi` });
}

describe("ClosureService.closePool", () => {
  it("refunds each Member pro-rata against their total contributions", async () => {
    const { closureService, depositRepository, userRepository, pool } = await makeService();
    seedUpi(userRepository, MEMBER_A);
    seedUpi(userRepository, MEMBER_B);
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refundTotalPaise).toBe(100000);
    const byMember = Object.fromEntries(result.refunds.map((r) => [r.memberId, r.amountPaise]));
    expect(byMember[MEMBER_A]).toBe(60000);
    expect(byMember[MEMBER_B]).toBe(40000);
  });

  it("accounts for Spends and Reimbursements already taken out", async () => {
    const {
      closureService,
      depositRepository,
      spendRepository,
      reimbursementRepository,
      userRepository,
      pool,
    } = await makeService();
    seedUpi(userRepository, MEMBER_A);
    seedUpi(userRepository, MEMBER_B);
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 20000, 200);
    await reimbursementRepository.create(pool.id, MEMBER_A, "a@upi", 9800);
    // Remaining balance: 100000 - 20000 - 200 - 9800 = 70000.

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refundTotalPaise).toBe(70000);
    const byMember = Object.fromEntries(result.refunds.map((r) => [r.memberId, r.amountPaise]));
    expect(byMember[MEMBER_A]).toBe(42000); // 60% of 70000
    expect(byMember[MEMBER_B]).toBe(28000); // 40% of 70000
  });

  it("sets the Pool's state to CLOSED", async () => {
    const { closureService, pool } = await makeService();

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.pool.state).toBe("CLOSED");
  });

  it("excludes a Member with zero deposits from the refund", async () => {
    const { closureService, depositRepository, userRepository, pool } = await makeService();
    seedUpi(userRepository, MEMBER_A);
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refunds.map((r) => r.memberId)).toEqual([MEMBER_A]);
  });

  it("closes a Pool with no deposits and issues no refunds", async () => {
    const { closureService, pool } = await makeService();

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refundTotalPaise).toBe(0);
    expect(result.refunds).toEqual([]);
  });

  it("records each Refund with a VPA and no fee", async () => {
    const { closureService, depositRepository, userRepository, pool } = await makeService();
    seedUpi(userRepository, MEMBER_A);
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refunds[0].vpa).toBeTruthy();
    expect(result.refunds[0].amountPaise).toBe(50000);
  });

  it("refunds to the Member's Registered UPI ID from Onboarding when they have one (ADR 0012)", async () => {
    const { closureService, depositRepository, userRepository, pool } = await makeService();
    userRepository.seedVerifiedUser(MEMBER_A, "+91member_a", { upiId: "member-a@upi" });
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refunds[0].vpa).toBe("member-a@upi");
  });

  it("rejects Closure if any Member has no Registered UPI ID on file", async () => {
    const { closureService, depositRepository, pool } = await makeService();
    // Deliberately not seeded — Onboarding is supposed to guarantee every
    // Member has a upiId, so this simulates that guarantee somehow failing.
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    await expect(closureService.closePool(pool.id, ORGANIZER_ID)).rejects.toThrow(
      MemberHasNoRegisteredUpiIdError,
    );
  });

  it("refunds no one if one Member has no Registered UPI ID (fails atomically)", async () => {
    const { closureService, depositRepository, refundRepository, userRepository, pool } =
      await makeService();
    seedUpi(userRepository, MEMBER_A);
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000); // MEMBER_B not seeded

    await expect(closureService.closePool(pool.id, ORGANIZER_ID)).rejects.toThrow(
      MemberHasNoRegisteredUpiIdError,
    );
    expect(await refundRepository.listByPool(pool.id)).toEqual([]);
  });

  it("rejects Closure by a non-Organizer", async () => {
    const { closureService, pool } = await makeService();

    await expect(closureService.closePool(pool.id, STRANGER_ID)).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });

  it("rejects Closure of an unknown Pool", async () => {
    const { closureService } = await makeService();

    await expect(closureService.closePool("does-not-exist", ORGANIZER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("rejects Closure of an already-Closed Pool", async () => {
    const { closureService, pool } = await makeService();
    await closureService.closePool(pool.id, ORGANIZER_ID);

    await expect(closureService.closePool(pool.id, ORGANIZER_ID)).rejects.toThrow(
      PoolAlreadyClosedError,
    );
  });

  it("allows Closing a Locked Pool", async () => {
    const { closureService, poolRepository, depositRepository, userRepository, pool } =
      await makeService();
    seedUpi(userRepository, MEMBER_A);
    await depositRepository.create(pool.id, MEMBER_A, 50000);
    await poolRepository.updateState(pool.id, "LOCKED");

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.pool.state).toBe("CLOSED");
  });
});

describe("ClosureService refund notifications", () => {
  it("notifies each recipient only, not every Member of the Pool", async () => {
    const { closureService, depositRepository, userRepository, notificationRepository, pool } =
      await makeService();
    seedUpi(userRepository, MEMBER_A);
    seedUpi(userRepository, MEMBER_B);
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    await closureService.closePool(pool.id, ORGANIZER_ID);

    const forA = await notificationRepository.listByUser(MEMBER_A);
    const forB = await notificationRepository.listByUser(MEMBER_B);
    const forOrganizer = await notificationRepository.listByUser(ORGANIZER_ID);
    expect(forA).toHaveLength(1);
    expect(forA[0]).toMatchObject({
      poolId: pool.id,
      type: "REFUND_PROCESSED",
      message: "Refund of ₹600 processed for Goa Trip",
    });
    expect(forB).toHaveLength(1);
    expect(forOrganizer).toHaveLength(0);
  });

  it("sends no notification for a Member excluded from the refund (zero deposits)", async () => {
    const { closureService, depositRepository, userRepository, notificationRepository, pool } =
      await makeService();
    seedUpi(userRepository, MEMBER_A);
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(await notificationRepository.listByUser(MEMBER_B)).toHaveLength(0);
  });
});

describe("ClosureService.closePoolViaVote", () => {
  it("closes the Pool and refunds pro-rata without an Organizer check", async () => {
    const { closureService, depositRepository, userRepository, pool } = await makeService();
    seedUpi(userRepository, MEMBER_A);
    seedUpi(userRepository, MEMBER_B);
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    const result = await closureService.closePoolViaVote(pool.id);

    expect(result.pool.state).toBe("CLOSED");
    expect(result.refundTotalPaise).toBe(100000);
  });

  it("does not claw back money already Spent or Reimbursed", async () => {
    const { closureService, depositRepository, spendRepository, userRepository, pool } =
      await makeService();
    seedUpi(userRepository, MEMBER_A);
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 40000, 400);

    const result = await closureService.closePoolViaVote(pool.id);

    expect(result.refundTotalPaise).toBe(100000 - 40000 - 400);
  });

  it("rejects Closure of an already-Closed Pool", async () => {
    const { closureService, pool } = await makeService();
    await closureService.closePoolViaVote(pool.id);

    await expect(closureService.closePoolViaVote(pool.id)).rejects.toThrow(PoolAlreadyClosedError);
  });

  it("rejects Closure of an unknown Pool", async () => {
    const { closureService } = await makeService();

    await expect(closureService.closePoolViaVote("does-not-exist")).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});

describe("ClosureService.previewClosure", () => {
  it("returns the same breakdown as closePool would, without paying out or closing", async () => {
    const { closureService, depositRepository, poolRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    const preview = await closureService.previewClosure(pool.id, ORGANIZER_ID);

    expect(preview.refundTotalPaise).toBe(100000);
    const stillOpen = await poolRepository.findById(pool.id);
    expect(stillOpen?.state).toBe("ACTIVE");
  });

  it("rejects a non-Organizer", async () => {
    const { closureService, pool } = await makeService();

    await expect(closureService.previewClosure(pool.id, STRANGER_ID)).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });
});

describe("ClosureService + a removed Member (ticket #11)", () => {
  it("still refunds a removed Member's prior contributions pro-rata", async () => {
    const { closureService, poolRepository, depositRepository, userRepository, pool } =
      await makeService();
    const membershipRepository = new InMemoryMembershipRepository();
    const invitationRepository = new InMemoryInvitationRepository();
    // Pool is OPEN (see makeService above) — joining never reaches the
    // JoinRequest branch, so this can stay a throwaway instance.
    const joinRequestService = new JoinRequestService({
      joinRequestRepository: new InMemoryJoinRequestRepository(),
      membershipRepository,
      poolRepository,
      userRepository,
      notificationService: new NotificationService({ notificationRepository: new InMemoryNotificationRepository() }),
    });
    const membershipService = new MembershipService({
      poolRepository,
      membershipRepository,
      invitationRepository,
      joinRequestService,
    });
    // OPEN Pool here is created directly via poolRepository, bypassing
    // PoolService.createPool — seed the Organizer's Membership to match what
    // that would have done, since joining now requires it (ADR-0017).
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    seedUpi(userRepository, MEMBER_A);
    seedUpi(userRepository, MEMBER_B);

    await membershipService.joinByPoolId(MEMBER_A, pool.id);
    await depositRepository.create(pool.id, MEMBER_A, 40000);
    await depositRepository.create(pool.id, MEMBER_B, 60000);

    await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_A);
    expect(await membershipRepository.find(pool.id, MEMBER_A)).toBeNull();

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    const byMember = Object.fromEntries(result.refunds.map((r) => [r.memberId, r.amountPaise]));
    expect(byMember[MEMBER_A]).toBe(40000);
    expect(byMember[MEMBER_B]).toBe(60000);
  });
});

describe("computeRefunds", () => {
  it("distributes rounding remainder so refunds sum to exactly the balance", () => {
    const contributions = new Map([
      ["a", 100],
      ["b", 100],
      ["c", 100],
    ]);

    const refunds = computeRefunds(contributions, 100);

    expect(refunds.reduce((sum, r) => sum + r.amountPaise, 0)).toBe(100);
    // 100/3 = 33.33 each; the leftover paisa goes to one of them.
    expect(refunds.every((r) => r.amountPaise === 33 || r.amountPaise === 34)).toBe(true);
  });

  it("returns an empty list when the remaining balance is zero", () => {
    const contributions = new Map([["a", 100]]);

    expect(computeRefunds(contributions, 0)).toEqual([]);
  });

  it("returns an empty list when nobody contributed", () => {
    expect(computeRefunds(new Map(), 5000)).toEqual([]);
  });
});
