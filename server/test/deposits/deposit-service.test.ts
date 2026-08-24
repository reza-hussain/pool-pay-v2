import { beforeEach, describe, expect, it } from "vitest";
import { DepositService } from "../../src/deposits/deposit-service.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryPendingDepositRepository } from "../../src/deposits/fakes/in-memory-pending-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryInvitationRepository } from "../../src/invitations/fakes/in-memory-invitation-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";
import {
  InvalidDepositAmountError,
  NotAMemberError,
  OpenPoolDepositsRetiredError,
  PoolNotAcceptingDepositsError,
  UnknownDepositReferenceError,
} from "../../src/deposits/types.js";
import { InvitationAmountMismatchError, InvitationNotFoundError } from "../../src/invitations/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeService(now?: () => Date) {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const invitationRepository = new InMemoryInvitationRepository();
  const depositRepository = new InMemoryDepositRepository();
  const pendingDepositRepository = new InMemoryPendingDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const paymentProvider = new FakePaymentProvider();
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  userRepository.seedVerifiedUser(MEMBER_ID);
  // Seeded even though not a Member of any Pool here — "non-Member" in these
  // tests means "not a Member of this particular Pool," not "doesn't have a
  // Pool Pay account," and createDepositIntent looks up the caller's User
  // record before NotAMemberError would ever get a chance to fire (that
  // check only happens later, in confirmDeposit).
  userRepository.seedVerifiedUser("user_stranger");
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });
  const depositService = new DepositService({
    poolRepository,
    membershipRepository,
    depositRepository,
    pendingDepositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
    userRepository,
    notificationService,
    invitationRepository,
    now,
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
  const customSplitPool = await poolRepository.create(ORGANIZER_ID, {
    name: "Uneven Dinner",
    type: "CUSTOM_SPLIT",
    perPersonAmountPaise: null,
    joinCode: "333333",
  });
  await membershipRepository.create(equalSplitPool.id, MEMBER_ID, "MEMBER");
  await membershipRepository.create(openPool.id, MEMBER_ID, "MEMBER");

  return {
    depositService,
    poolRepository,
    membershipRepository,
    invitationRepository,
    depositRepository,
    pendingDepositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
    userRepository,
    notificationRepository,
    equalSplitPool,
    openPool,
    customSplitPool,
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

function futureDate(days = 7): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function pastDate(hoursAgo = 1): Date {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
}

// Open Pool deposits are retired at createDepositIntent (ticket #59), so this
// bypasses it to simulate a pending intent that was already in flight before
// that rule shipped — confirmDeposit itself still has to complete it.
async function confirmLegacyOpenPoolDeposit(
  depositService: DepositService,
  pendingDepositRepository: InMemoryPendingDepositRepository,
  poolId: string,
  userId: string,
  amountPaise: number,
) {
  const providerRef = `legacy-${poolId}-${userId}-${amountPaise}`;
  await pendingDepositRepository.create(providerRef, poolId, userId);
  return depositService.confirmDeposit(providerRef, amountPaise);
}

describe("DepositService.createDepositIntent", () => {
  it("locks the amount for an Equal Split Pool", async () => {
    const { depositService, equalSplitPool } = await makeService();
    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);
    expect(intent.fixedAmountPaise).toBe(100000);
  });

  it("rejects starting a new Deposit into an Open Pool", async () => {
    const { depositService, openPool } = await makeService();
    await expect(depositService.createDepositIntent(openPool.id, MEMBER_ID)).rejects.toThrow(
      OpenPoolDepositsRetiredError,
    );
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { depositService } = await makeService();
    await expect(
      depositService.createDepositIntent("does-not-exist", MEMBER_ID),
    ).rejects.toThrow(PoolNotFoundError);
  });
});

describe("DepositService.createDepositIntent — Custom Split Pool (ticket #58)", () => {
  it("locks the amount from the caller's pending Invitation", async () => {
    const { depositService, invitationRepository, customSplitPool } = await makeService();
    await invitationRepository.create({
      poolId: customSplitPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    const intent = await depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID);

    expect(intent.fixedAmountPaise).toBe(30000);
  });

  it("throws InvitationNotFoundError when the caller has no pending Invitation", async () => {
    const { depositService, customSplitPool } = await makeService();

    await expect(
      depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID),
    ).rejects.toThrow(InvitationNotFoundError);
  });

  it("throws InvitationNotFoundError once the Invitation has been cancelled (ticket #62)", async () => {
    const { depositService, invitationRepository, customSplitPool } = await makeService();
    const invitation = await invitationRepository.create({
      poolId: customSplitPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });
    await invitationRepository.markCancelled(invitation.id);

    await expect(
      depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID),
    ).rejects.toThrow(InvitationNotFoundError);
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
    const { depositService, pendingDepositRepository, openPool } = await makeService();

    await confirmLegacyOpenPoolDeposit(depositService, pendingDepositRepository, openPool.id, MEMBER_ID, 25000);

    const summary = await depositService.getContributionSummary(openPool.id, MEMBER_ID);
    expect(summary).toEqual({ contributedPaise: 25000, expectedPaise: null, shortfallPaise: null });
  });

  it("rejects a non-positive amount", async () => {
    const { depositService, equalSplitPool } = await makeService();
    await expect(deposit(depositService, equalSplitPool.id, MEMBER_ID, 0)).rejects.toThrow(
      InvalidDepositAmountError,
    );
    await expect(deposit(depositService, equalSplitPool.id, MEMBER_ID, -500)).rejects.toThrow(
      InvalidDepositAmountError,
    );
  });

  it("rejects a non-integer amount", async () => {
    const { depositService, equalSplitPool } = await makeService();
    await expect(deposit(depositService, equalSplitPool.id, MEMBER_ID, 100.5)).rejects.toThrow(
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
    const { depositService, equalSplitPool } = await makeService();
    await expect(deposit(depositService, equalSplitPool.id, "user_stranger", 1000)).rejects.toThrow(
      NotAMemberError,
    );
  });

  it("rejects a deposit into a Pool that isn't Active", async () => {
    const { depositService, poolRepository, equalSplitPool } = await makeService();
    const intent = await depositService.createDepositIntent(equalSplitPool.id, MEMBER_ID);
    (await poolRepository.findById(equalSplitPool.id))!.state = "LOCKED";

    await expect(depositService.confirmDeposit(intent.id, 1000)).rejects.toThrow(
      PoolNotAcceptingDepositsError,
    );
  });

  it("still allows a Deposit intent already in flight for an Open Pool to complete", async () => {
    const { depositService, pendingDepositRepository, openPool } = await makeService();

    const result = await confirmLegacyOpenPoolDeposit(
      depositService,
      pendingDepositRepository,
      openPool.id,
      MEMBER_ID,
      25000,
    );

    expect(result.amountPaise).toBe(25000);
    expect(await depositService.getPoolBalance(openPool.id)).toBe(25000);
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

describe("DepositService.confirmDeposit — Custom Split Pool (ticket #58)", () => {
  async function makeServiceWithInvitation(assignedAmountPaise = 30000) {
    const service = await makeService();
    const invitation = await service.invitationRepository.create({
      poolId: service.customSplitPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise,
      token: "token_1",
      expiresAt: futureDate(),
    });
    return { ...service, invitation };
  }

  it("creates the Membership and Deposit together, and marks the Invitation paid, on an exact match", async () => {
    const { depositService, membershipRepository, invitationRepository, customSplitPool } =
      await makeServiceWithInvitation(30000);

    const created = await deposit(depositService, customSplitPool.id, ORGANIZER_ID, 30000);

    expect(created.amountPaise).toBe(30000);
    const membership = await membershipRepository.find(customSplitPool.id, ORGANIZER_ID);
    expect(membership).toMatchObject({ poolId: customSplitPool.id, userId: ORGANIZER_ID, role: "ORGANIZER" });
    const paidInvitation = await invitationRepository.findPendingByPoolAndInvitee(
      customSplitPool.id,
      ORGANIZER_ID,
    );
    expect(paidInvitation).toBeNull();
  });

  it("makes the Organizer the Pool's sole Member", async () => {
    const { depositService, membershipRepository, customSplitPool } = await makeServiceWithInvitation(30000);

    await deposit(depositService, customSplitPool.id, ORGANIZER_ID, 30000);

    const members = await membershipRepository.listByPool(customSplitPool.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: ORGANIZER_ID, role: "ORGANIZER" });
  });

  it("rejects a mismatched amount outright — no Membership, no shortfall recorded", async () => {
    const { depositService, membershipRepository, depositRepository, customSplitPool } =
      await makeServiceWithInvitation(30000);
    const intent = await depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID);

    await expect(depositService.confirmDeposit(intent.id, 20000)).rejects.toThrow(
      InvitationAmountMismatchError,
    );

    expect(await membershipRepository.find(customSplitPool.id, ORGANIZER_ID)).toBeNull();
    expect(await depositRepository.sumByPoolAndUser(customSplitPool.id, ORGANIZER_ID)).toBe(0);
  });

  it("rejects an overpayment outright too", async () => {
    const { depositService, customSplitPool } = await makeServiceWithInvitation(30000);
    const intent = await depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID);

    await expect(depositService.confirmDeposit(intent.id, 40000)).rejects.toThrow(
      InvitationAmountMismatchError,
    );
  });

  it("throws InvitationNotFoundError when confirming with no pending Invitation at all", async () => {
    const { depositService, pendingDepositRepository, customSplitPool } = await makeService();
    // Simulates a deposit intent created before any Invitation existed (or
    // after it was already consumed) — confirmDeposit re-checks regardless
    // of what createDepositIntent allowed.
    const pending = await pendingDepositRepository.create("ref_orphan", customSplitPool.id, ORGANIZER_ID);

    await expect(depositService.confirmDeposit(pending.providerRef, 30000)).rejects.toThrow(
      InvitationNotFoundError,
    );
  });

  it("blocks paying again once the Invitation has already been paid", async () => {
    const { depositService, customSplitPool } = await makeServiceWithInvitation(30000);
    await deposit(depositService, customSplitPool.id, ORGANIZER_ID, 30000);

    await expect(
      depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID),
    ).rejects.toThrow(InvitationNotFoundError);
  });
});

describe("Custom Split Pool — lazily-expired Invitation (ticket #60)", () => {
  it("createDepositIntent treats a past-expiresAt PENDING Invitation as not found", async () => {
    const { depositService, invitationRepository, customSplitPool } = await makeService();
    await invitationRepository.create({
      poolId: customSplitPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise: 30000,
      token: "token_expired",
      expiresAt: pastDate(),
    });

    await expect(
      depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID),
    ).rejects.toThrow(InvitationNotFoundError);
  });

  it("confirmDeposit rejects a payment once the Organizer's self-Invitation expired between intent and confirmation, expiring the Pool (ADR-0017)", async () => {
    let clock = new Date("2026-01-01T00:00:00Z");
    const { depositService, poolRepository, invitationRepository, customSplitPool } = await makeService(() => clock);
    await invitationRepository.create({
      poolId: customSplitPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
    const intent = await depositService.createDepositIntent(customSplitPool.id, ORGANIZER_ID);

    clock = new Date("2026-01-03T00:00:00Z"); // now past expiresAt
    await expect(depositService.confirmDeposit(intent.id, 30000)).rejects.toThrow(
      PoolNotAcceptingDepositsError,
    );
    expect((await poolRepository.findById(customSplitPool.id))!.state).toBe("EXPIRED");
  });
});

describe("DepositService.confirmDeposit — Equal Split Organizer's first share (ADR-0017)", () => {
  async function makeServiceWithOrganizerInvitation(assignedAmountPaise = 100000) {
    const service = await makeService();
    const invitation = await service.invitationRepository.create({
      poolId: service.equalSplitPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise,
      token: "token_equal_split_self",
      expiresAt: futureDate(),
    });
    return { ...service, invitation };
  }

  it("creates the ORGANIZER Membership and marks the Invitation paid, on an exact match", async () => {
    const { depositService, membershipRepository, invitationRepository, equalSplitPool } =
      await makeServiceWithOrganizerInvitation();

    const created = await deposit(depositService, equalSplitPool.id, ORGANIZER_ID, 100000);

    expect(created.amountPaise).toBe(100000);
    const membership = await membershipRepository.find(equalSplitPool.id, ORGANIZER_ID);
    expect(membership).toMatchObject({ poolId: equalSplitPool.id, userId: ORGANIZER_ID, role: "ORGANIZER" });
    expect(
      await invitationRepository.findPendingByPoolAndInvitee(equalSplitPool.id, ORGANIZER_ID),
    ).toBeNull();
  });

  it("stays amount-unenforced, unlike Custom Split's exact-match requirement", async () => {
    const { depositService, membershipRepository, equalSplitPool } =
      await makeServiceWithOrganizerInvitation(100000);

    const result = await deposit(depositService, equalSplitPool.id, ORGANIZER_ID, 40000);

    expect(result.amountPaise).toBe(40000);
    expect(await membershipRepository.find(equalSplitPool.id, ORGANIZER_ID)).toMatchObject({
      role: "ORGANIZER",
    });
  });

  it("throws InvitationNotFoundError when the Organizer has no pending self-Invitation at all", async () => {
    const { depositService, pendingDepositRepository, equalSplitPool } = await makeService();
    const pending = await pendingDepositRepository.create("ref_orphan", equalSplitPool.id, ORGANIZER_ID);

    await expect(depositService.confirmDeposit(pending.providerRef, 100000)).rejects.toThrow(
      InvitationNotFoundError,
    );
  });

  it("still requires a Membership for a non-Organizer depositor with no self-Invitation", async () => {
    const { depositService, equalSplitPool } = await makeServiceWithOrganizerInvitation();

    await expect(deposit(depositService, equalSplitPool.id, "user_stranger", 100000)).rejects.toThrow(
      NotAMemberError,
    );
  });
});

describe("DepositService — lazy expiry of the Organizer's self-Invitation (ADR-0017)", () => {
  it("rejects a Deposit confirmation once the self-Invitation has lapsed, and persists the Pool as EXPIRED", async () => {
    const { depositService, poolRepository, invitationRepository, pendingDepositRepository } =
      await makeService();
    const lapsedPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Abandoned Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "999999",
    });
    await invitationRepository.create({
      poolId: lapsedPool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise: 100000,
      token: "token_lapsed",
      expiresAt: pastDate(),
    });
    const pending = await pendingDepositRepository.create("ref_lapsed", lapsedPool.id, ORGANIZER_ID);

    await expect(depositService.confirmDeposit(pending.providerRef, 100000)).rejects.toThrow(
      PoolNotAcceptingDepositsError,
    );

    expect((await poolRepository.findById(lapsedPool.id))!.state).toBe("EXPIRED");
    expect(
      await invitationRepository.findPendingByPoolAndInvitee(lapsedPool.id, ORGANIZER_ID),
    ).toBeNull();
  });

  it("does not expire a Pool whose Organizer's self-Invitation hasn't lapsed yet", async () => {
    const { depositService, poolRepository, invitationRepository, pendingDepositRepository } =
      await makeService();
    const pool = await poolRepository.create(ORGANIZER_ID, {
      name: "Upcoming Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "888888",
    });
    await invitationRepository.create({
      poolId: pool.id,
      inviteeUserId: ORGANIZER_ID,
      assignedAmountPaise: 100000,
      token: "token_not_lapsed",
      expiresAt: futureDate(),
    });
    const pending = await pendingDepositRepository.create("ref_ok", pool.id, ORGANIZER_ID);

    await expect(depositService.confirmDeposit(pending.providerRef, 100000)).resolves.toMatchObject({
      amountPaise: 100000,
    });
    expect((await poolRepository.findById(pool.id))!.state).toBe("ACTIVE");
  });
});

describe("DepositService.confirmDeposit notifications", () => {
  it("notifies every other current Member, but not the depositor", async () => {
    const { depositService, membershipRepository, userRepository, notificationRepository, equalSplitPool } =
      await makeService();
    userRepository.seedVerifiedUser(MEMBER_ID, undefined, { name: "Kabir" });
    await membershipRepository.create(equalSplitPool.id, ORGANIZER_ID, "ORGANIZER");

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 25000);

    const organizerNotifications = await notificationRepository.listByUser(ORGANIZER_ID);
    expect(organizerNotifications).toHaveLength(1);
    expect(organizerNotifications[0]).toMatchObject({
      poolId: equalSplitPool.id,
      type: "DEPOSIT_RECEIVED",
      message: "Kabir deposited ₹250 into Goa Trip",
    });
    expect(await notificationRepository.listByUser(MEMBER_ID)).toHaveLength(0);
  });

  it("also sends POOL_FULLY_FUNDED when a deposit brings an Equal Split Pool's balance to its target", async () => {
    const { depositService, membershipRepository, notificationRepository, equalSplitPool } =
      await makeService();
    await membershipRepository.create(equalSplitPool.id, ORGANIZER_ID, "ORGANIZER");
    // 2 Members × ₹1,000 perPersonAmountPaise = ₹2,000 target.

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 200000);

    const organizerNotifications = await notificationRepository.listByUser(ORGANIZER_ID);
    const types = organizerNotifications.map((n) => n.type);
    expect(types).toContain("DEPOSIT_RECEIVED");
    expect(types).toContain("POOL_FULLY_FUNDED");
  });

  it("does not re-send POOL_FULLY_FUNDED on a later deposit once already funded", async () => {
    const { depositService, membershipRepository, notificationRepository, equalSplitPool } =
      await makeService();
    await membershipRepository.create(equalSplitPool.id, ORGANIZER_ID, "ORGANIZER");
    // 2 Members × ₹1,000 perPersonAmountPaise = ₹2,000 target; MEMBER_ID alone
    // reaches it in one deposit, so a second deposit shouldn't cross it again.
    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 200000);
    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 50000);

    const organizerNotifications = await notificationRepository.listByUser(ORGANIZER_ID);
    const fullyFundedCount = organizerNotifications.filter((n) => n.type === "POOL_FULLY_FUNDED").length;
    expect(fullyFundedCount).toBe(1);
  });

  it("does not send POOL_FULLY_FUNDED for an Open Pool", async () => {
    const { depositService, membershipRepository, notificationRepository, pendingDepositRepository, openPool } =
      await makeService();
    await membershipRepository.create(openPool.id, ORGANIZER_ID, "ORGANIZER");

    await confirmLegacyOpenPoolDeposit(
      depositService,
      pendingDepositRepository,
      openPool.id,
      MEMBER_ID,
      999999999,
    );

    const organizerNotifications = await notificationRepository.listByUser(ORGANIZER_ID);
    expect(organizerNotifications.some((n) => n.type === "POOL_FULLY_FUNDED")).toBe(false);
  });
});

describe("DepositService.getPoolBalance", () => {
  it("subtracts Spends (amount + fee) from total deposited", async () => {
    const { depositService, spendRepository, equalSplitPool } = await makeService();

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 100000);
    await spendRepository.create(equalSplitPool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000 - 30000 - 300);
  });

  it("subtracts Reimbursements from total deposited", async () => {
    const { depositService, reimbursementRepository, equalSplitPool } = await makeService();

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 100000);
    await reimbursementRepository.create(equalSplitPool.id, MEMBER_ID, "member@upi", 20000);

    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000 - 20000);
  });

  it("subtracts Refunds from total deposited", async () => {
    const { depositService, refundRepository, equalSplitPool } = await makeService();

    await deposit(depositService, equalSplitPool.id, MEMBER_ID, 100000);
    await refundRepository.create(equalSplitPool.id, MEMBER_ID, "member@fakebank", 40000);

    expect(await depositService.getPoolBalance(equalSplitPool.id)).toBe(100000 - 40000);
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
