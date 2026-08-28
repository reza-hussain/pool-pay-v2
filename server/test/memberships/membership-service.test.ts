import { beforeEach, describe, expect, it } from "vitest";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryInvitationRepository } from "../../src/invitations/fakes/in-memory-invitation-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemorySpendAttributionRepository } from "../../src/spends/fakes/in-memory-spend-attribution-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolAwaitingPaymentError,
  PoolClosedError,
  PoolNotFoundError,
  TargetAlreadyOrganizerError,
} from "../../src/memberships/types.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";
import { MemberHasNoRegisteredUpiIdError } from "../../src/reimbursements/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const invitationRepository = new InMemoryInvitationRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const spendAttributionRepository = new InMemorySpendAttributionRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const userRepository = new InMemoryUserRepository();
  const paymentProvider = new FakePaymentProvider();
  const membershipService = new MembershipService({
    poolRepository,
    membershipRepository,
    invitationRepository,
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
    joinCode: "123456",
  });
  // OPEN Pool created directly via the repository, bypassing
  // PoolService.createPool — seed the Organizer's Membership to match what
  // that would have done, since joining now requires it (ADR-0017).
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

  return {
    membershipService,
    poolRepository,
    membershipRepository,
    invitationRepository,
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

// Onboarding (ADR 0012) is mandatory before a person can join or deposit
// into any Pool, so a Member with a positive remaining balance is expected
// to have a Registered UPI ID by the time a Departure needs to pay them.
function seedUpi(userRepository: InMemoryUserRepository, memberId: string) {
  userRepository.seedVerifiedUser(memberId, undefined, { upiId: `${memberId}@upi` });
}

describe("MembershipService.joinByPoolId", () => {
  it("creates a MEMBER membership for the joining user", async () => {
    const { membershipService, pool } = await makeService();

    const membership = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(membership).toMatchObject({ poolId: pool.id, userId: MEMBER_ID, role: "MEMBER" });
  });

  it("throws PoolNotFoundError for an unknown pool id", async () => {
    const { membershipService } = await makeService();
    await expect(membershipService.joinByPoolId(MEMBER_ID, "does-not-exist")).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("is idempotent — joining twice returns the same membership, no duplicate", async () => {
    const { membershipService, membershipRepository, pool } = await makeService();

    const first = await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    const second = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(second.id).toBe(first.id);
    const all = await membershipRepository.listByPool(pool.id);
    expect(all.filter((m) => m.userId === MEMBER_ID)).toHaveLength(1);
  });

  it("throws PoolClosedError when the Pool is closed", async () => {
    const { membershipService, poolRepository, pool } = await makeService();
    (await poolRepository.findById(pool.id))!.state = "CLOSED";

    await expect(membershipService.joinByPoolId(MEMBER_ID, pool.id)).rejects.toThrow(
      PoolClosedError,
    );
  });
});

describe("MembershipService.joinByCode", () => {
  it("resolves the Pool by its join code and creates a membership", async () => {
    const { membershipService, pool } = await makeService();

    const membership = await membershipService.joinByCode(MEMBER_ID, "123456");

    expect(membership).toMatchObject({ poolId: pool.id, userId: MEMBER_ID, role: "MEMBER" });
  });

  it("throws InvalidJoinCodeError for an unknown code", async () => {
    const { membershipService } = await makeService();
    await expect(membershipService.joinByCode(MEMBER_ID, "000000")).rejects.toThrow(
      InvalidJoinCodeError,
    );
  });
});

describe("MembershipService — Awaiting Payment gate (ADR-0017)", () => {
  const OTHER_ORGANIZER_ID = "user_awaiting_organizer";

  async function makePoolAwaitingPayment() {
    const { membershipService, poolRepository, membershipRepository, invitationRepository } =
      await makeService();

    const pool = await poolRepository.create(OTHER_ORGANIZER_ID, {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "654321",
    });
    // No Membership for the Organizer yet — mirrors PoolService.createPool
    // deferring it behind a self-Invitation (ADR-0017).
    await invitationRepository.create({
      poolId: pool.id,
      inviteeUserId: OTHER_ORGANIZER_ID,
      assignedAmountPaise: 100000,
      token: "token_awaiting",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return { membershipService, poolRepository, membershipRepository, invitationRepository, pool };
  }

  it("rejects joinByPoolId while the Organizer hasn't paid their own share", async () => {
    const { membershipService, pool } = await makePoolAwaitingPayment();

    await expect(membershipService.joinByPoolId(MEMBER_ID, pool.id)).rejects.toThrow(
      PoolAwaitingPaymentError,
    );
  });

  it("rejects joinByCode the same way", async () => {
    const { membershipService, pool } = await makePoolAwaitingPayment();

    await expect(membershipService.joinByCode(MEMBER_ID, pool.joinCode)).rejects.toThrow(
      PoolAwaitingPaymentError,
    );
  });

  it("allows joining once the Organizer has a Membership", async () => {
    const { membershipService, membershipRepository, pool } = await makePoolAwaitingPayment();
    await membershipRepository.create(pool.id, OTHER_ORGANIZER_ID, "ORGANIZER");

    const membership = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(membership).toMatchObject({ poolId: pool.id, userId: MEMBER_ID, role: "MEMBER" });
  });

  it("rejects joining once the self-Invitation has lapsed, lazily marking the Pool EXPIRED", async () => {
    const { membershipService, poolRepository, invitationRepository } = await makeService();
    const pool = await poolRepository.create(OTHER_ORGANIZER_ID, {
      name: "Abandoned Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "777777",
    });
    await invitationRepository.create({
      poolId: pool.id,
      inviteeUserId: OTHER_ORGANIZER_ID,
      assignedAmountPaise: 100000,
      token: "token_lapsed",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await expect(membershipService.joinByPoolId(MEMBER_ID, pool.id)).rejects.toThrow(
      PoolAwaitingPaymentError,
    );

    expect((await poolRepository.findById(pool.id))!.state).toBe("EXPIRED");
  });
});

describe("MembershipService.listMembers", () => {
  it("lists every member of a Pool, including the Organizer", async () => {
    const { membershipService, membershipRepository, pool } = await makeService();
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    const members = await membershipService.listMembers(pool.id);

    expect(members).toHaveLength(2);
    expect(members.map((m) => m.userId).sort()).toEqual([MEMBER_ID, ORGANIZER_ID].sort());
  });
});

describe("MembershipService.removeMember", () => {
  it("removes a Member so they no longer appear as a Member", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    const members = await membershipService.listMembers(pool.id);
    expect(members.map((m) => m.userId)).not.toContain(MEMBER_ID);
  });

  it("allows the removed Member to rejoin later", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    const rejoined = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(rejoined).toMatchObject({ poolId: pool.id, userId: MEMBER_ID });
    // 2: the Organizer (seeded in makeService, mirroring PoolService.createPool
    // for an OPEN Pool) plus the rejoined Member.
    expect(await membershipService.listMembers(pool.id)).toHaveLength(2);
  });

  it("rejects removal by a non-Organizer", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    await expect(
      membershipService.removeMember(pool.id, MEMBER_ID, MEMBER_ID),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects the Organizer removing themselves", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.removeMember(pool.id, ORGANIZER_ID, ORGANIZER_ID),
    ).rejects.toThrow(CannotRemoveOrganizerError);
  });

  it("rejects removing someone who isn't a Member", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.removeMember(pool.id, ORGANIZER_ID, "user_stranger"),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("rejects removal from an unknown Pool", async () => {
    const { membershipService } = await makeService();

    await expect(
      membershipService.removeMember("does-not-exist", ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects removal from an already-Closed Pool", async () => {
    const { membershipService, poolRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(
      membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolClosedError);
  });

  it("pays the computed default (Your Remaining Balance) when no adjustment is given", async () => {
    const { membershipService, depositRepository, refundRepository, userRepository, pool } =
      await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    seedUpi(userRepository, MEMBER_ID);
    await depositRepository.create(pool.id, MEMBER_ID, 30000);

    const refund = await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    expect(refund).toMatchObject({ poolId: pool.id, memberId: MEMBER_ID, amountPaise: 30000 });
    expect(await refundRepository.sumByPool(pool.id)).toBe(30000);
  });

  it("pays an adjusted amount instead of the computed default", async () => {
    const { membershipService, depositRepository, userRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    seedUpi(userRepository, MEMBER_ID);
    await depositRepository.create(pool.id, MEMBER_ID, 30000);

    const refund = await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID, 10000);

    expect(refund).toMatchObject({ amountPaise: 10000 });
  });

  it("caps an adjusted amount at the Pool's actual cash on hand", async () => {
    const { membershipService, depositRepository, userRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    seedUpi(userRepository, MEMBER_ID);
    await depositRepository.create(pool.id, MEMBER_ID, 30000);

    const refund = await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID, 1000000);

    // Only 30000 was ever deposited into the Pool — an adjustment can't
    // manufacture cash that was never there (Phase 1's shortfall cap).
    expect(refund).toMatchObject({ amountPaise: 30000 });
  });

  it("caps the computed default at actual Pool cash when a Reimbursement has drawn it down", async () => {
    const {
      membershipService,
      depositRepository,
      reimbursementRepository,
      userRepository,
      pool,
    } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    seedUpi(userRepository, MEMBER_ID);
    seedUpi(userRepository, ORGANIZER_ID);
    await depositRepository.create(pool.id, MEMBER_ID, 30000);
    // Seeded directly the way ReimbursementService.recordReimbursement would
    // have — draws down actual cash without touching MEMBER_ID's own
    // Deposits/attributions (their Your Remaining Balance stays 30000).
    await reimbursementRepository.create(pool.id, ORGANIZER_ID, `${ORGANIZER_ID}@upi`, 25000);

    const refund = await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    expect(refund).toMatchObject({ amountPaise: 5000 });
  });

  it("skips the transfer and the Registered UPI ID check when the computed balance is zero or less", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    // No Deposit, no UPI seeded — would throw MemberHasNoRegisteredUpiIdError
    // if a transfer were attempted for a Member with nothing to refund.

    const refund = await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    expect(refund).toBeNull();
  });

  it("throws MemberHasNoRegisteredUpiIdError when a positive refund has nowhere to go", async () => {
    const { membershipService, depositRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await depositRepository.create(pool.id, MEMBER_ID, 15000);
    // No seedUpi(MEMBER_ID) — Onboarding incomplete.

    await expect(membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID)).rejects.toThrow(
      MemberHasNoRegisteredUpiIdError,
    );
  });
});

describe("MembershipService.previewDeparture", () => {
  it("returns the computed default without side effects", async () => {
    const { membershipService, membershipRepository, depositRepository, refundRepository, pool } =
      await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await depositRepository.create(pool.id, MEMBER_ID, 25000);

    const preview = await membershipService.previewDeparture(pool.id, ORGANIZER_ID, MEMBER_ID);

    expect(preview).toEqual({ amountPaise: 25000 });
    expect(await membershipRepository.find(pool.id, MEMBER_ID)).not.toBeNull();
    expect(await refundRepository.sumByPool(pool.id)).toBe(0);
  });

  it("rejects a non-Organizer caller", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    await expect(
      membershipService.previewDeparture(pool.id, MEMBER_ID, MEMBER_ID),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects previewing the Organizer themselves", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.previewDeparture(pool.id, ORGANIZER_ID, ORGANIZER_ID),
    ).rejects.toThrow(CannotRemoveOrganizerError);
  });

  it("rejects an unknown Member", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.previewDeparture(pool.id, ORGANIZER_ID, "user_stranger"),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("rejects an unknown Pool", async () => {
    const { membershipService } = await makeService();

    await expect(
      membershipService.previewDeparture("does-not-exist", ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolNotFoundError);
  });
});

describe("MembershipService.leaveSelf", () => {
  it("refunds the caller's own remaining balance and removes their Membership", async () => {
    const { membershipService, membershipRepository, depositRepository, userRepository, pool } =
      await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    seedUpi(userRepository, MEMBER_ID);
    await depositRepository.create(pool.id, MEMBER_ID, 45000);

    const refund = await membershipService.leaveSelf(pool.id, MEMBER_ID);

    expect(refund).toMatchObject({ poolId: pool.id, memberId: MEMBER_ID, amountPaise: 45000 });
    expect(await membershipRepository.find(pool.id, MEMBER_ID)).toBeNull();
  });

  it("is blocked for the current Organizer", async () => {
    const { membershipService, pool } = await makeService();

    await expect(membershipService.leaveSelf(pool.id, ORGANIZER_ID)).rejects.toThrow(
      CannotRemoveOrganizerError,
    );
  });

  it("rejects a caller who isn't a Member", async () => {
    const { membershipService, pool } = await makeService();

    await expect(membershipService.leaveSelf(pool.id, "user_stranger")).rejects.toThrow(
      MemberNotFoundError,
    );
  });

  it("rejects on an unknown Pool", async () => {
    const { membershipService } = await makeService();

    await expect(membershipService.leaveSelf("does-not-exist", MEMBER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("throws MemberHasNoRegisteredUpiIdError when a positive balance has nowhere to go", async () => {
    const { membershipService, depositRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await depositRepository.create(pool.id, MEMBER_ID, 20000);

    await expect(membershipService.leaveSelf(pool.id, MEMBER_ID)).rejects.toThrow(
      MemberHasNoRegisteredUpiIdError,
    );
  });
});

describe("MembershipService.transferOrganizer", () => {
  it("updates both Pool.organizerId and both Memberships' roles atomically", async () => {
    const { membershipService, poolRepository, membershipRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    const updatedPool = await membershipService.transferOrganizer(pool.id, ORGANIZER_ID, MEMBER_ID);

    expect(updatedPool.organizerId).toBe(MEMBER_ID);
    expect((await poolRepository.findById(pool.id))!.organizerId).toBe(MEMBER_ID);
    expect((await membershipRepository.find(pool.id, ORGANIZER_ID))!.role).toBe("MEMBER");
    expect((await membershipRepository.find(pool.id, MEMBER_ID))!.role).toBe("ORGANIZER");
  });

  it("rejects a caller who isn't the current Organizer", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    const otherMemberId = "user_other";
    await membershipService.joinByPoolId(otherMemberId, pool.id);

    await expect(
      membershipService.transferOrganizer(pool.id, MEMBER_ID, otherMemberId),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects a target who isn't an active Member", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.transferOrganizer(pool.id, ORGANIZER_ID, "user_stranger"),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("rejects a target who is already the Organizer", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.transferOrganizer(pool.id, ORGANIZER_ID, ORGANIZER_ID),
    ).rejects.toThrow(TargetAlreadyOrganizerError);
  });

  it("rejects on an already-Closed Pool", async () => {
    const { membershipService, poolRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(
      membershipService.transferOrganizer(pool.id, ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolClosedError);
  });

  it("rejects on an unknown Pool", async () => {
    const { membershipService } = await makeService();

    await expect(
      membershipService.transferOrganizer("does-not-exist", ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("lets the outgoing Organizer subsequently leaveSelf once no longer the Organizer", async () => {
    const { membershipService, membershipRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await membershipService.transferOrganizer(pool.id, ORGANIZER_ID, MEMBER_ID);

    // The outgoing Organizer never deposited, so their remaining balance is
    // zero — leaveSelf succeeds with no refund and no Registered UPI ID needed.
    const refund = await membershipService.leaveSelf(pool.id, ORGANIZER_ID);

    expect(refund).toBeNull();
    expect(await membershipRepository.find(pool.id, ORGANIZER_ID)).toBeNull();
  });
});
