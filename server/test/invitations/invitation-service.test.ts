import { beforeEach, describe, expect, it } from "vitest";
import { InvitationService } from "../../src/invitations/invitation-service.js";
import { InMemoryInvitationRepository } from "../../src/invitations/fakes/in-memory-invitation-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";
import { NotCustomSplitPoolError, NotPoolOrganizerError } from "../../src/pools/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";
import {
  InvalidInvitationAmountError,
  InvalidInvitationExpiryPresetError,
  InvitationAlreadyPendingError,
  InvitationNotAcceptableError,
  InvitationNotCancellableError,
  InvitationNotFoundForAccepterError,
  InvitationRecordNotFoundError,
  InvitationRequiresPaymentError,
  InvitationLinkNotFoundError,
  InviteeAlreadyMemberError,
  InviteeNotRegisteredError,
  NotEqualSplitPoolError,
  OrganizerNotAMemberError,
} from "../../src/invitations/types.js";

const ORGANIZER_ID = "user_organizer";
const INVITEE_ID = "user_invitee";
const INVITEE_PHONE = "+919876500001";

async function makeService(now?: () => Date) {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const invitationRepository = new InMemoryInvitationRepository();
  const userRepository = new InMemoryUserRepository();
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });

  userRepository.seedVerifiedUser(ORGANIZER_ID, "+919876500000", { name: "Rhea" });
  userRepository.seedVerifiedUser(INVITEE_ID, INVITEE_PHONE, { name: "Dev" });

  const invitationService = new InvitationService({
    invitationRepository,
    poolRepository,
    membershipRepository,
    userRepository,
    notificationService,
    now,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Munnar Trip",
    type: "CUSTOM_SPLIT",
    perPersonAmountPaise: null,
    joinCode: "555555",
  });
  // The Organizer only reaches "can invite others" after paying their own
  // share — simulate that having already happened (ADR 0016).
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

  return {
    invitationService,
    invitationRepository,
    poolRepository,
    membershipRepository,
    userRepository,
    notificationRepository,
    pool,
  };
}

async function makeEqualSplitPool(
  poolRepository: Awaited<ReturnType<typeof makeService>>["poolRepository"],
  membershipRepository: Awaited<ReturnType<typeof makeService>>["membershipRepository"],
) {
  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "EQUAL_SPLIT",
    perPersonAmountPaise: 100000,
    joinCode: "666666",
  });
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
  return pool;
}

describe("InvitationService.sendInvitation", () => {
  it("sends an Invitation and notifies the invitee", async () => {
    const { invitationService, pool, notificationRepository } = await makeService();

    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    expect(invitation).toMatchObject({
      poolId: pool.id,
      inviteeUserId: INVITEE_ID,
      assignedAmountPaise: 250000,
      state: "PENDING",
    });

    const notifications = await notificationRepository.listByUser(INVITEE_ID);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ poolId: pool.id, type: "INVITATION_RECEIVED" });
    expect(notifications[0].message).toContain("Rhea");
    expect(notifications[0].message).toContain("Munnar Trip");
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { invitationService } = await makeService();
    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, "does-not-exist", INVITEE_PHONE, 250000),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a non-Organizer sender", async () => {
    const { invitationService, pool } = await makeService();
    await expect(
      invitationService.sendInvitation("user_stranger", pool.id, INVITEE_PHONE, 250000),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects sending on a non-Custom-Split Pool", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "666666",
    });
    await membershipRepository.create(equalSplitPool.id, ORGANIZER_ID, "ORGANIZER");

    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE, 250000),
    ).rejects.toThrow(NotCustomSplitPoolError);
  });

  it("rejects a non-positive or non-integer amount", async () => {
    const { invitationService, pool } = await makeService();
    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 0),
    ).rejects.toThrow(InvalidInvitationAmountError);
    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 100.5),
    ).rejects.toThrow(InvalidInvitationAmountError);
  });

  it("rejects an Organizer who hasn't paid their own share yet", async () => {
    const { invitationService, poolRepository } = await makeService();
    const unpaidPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Unpaid Pool",
      type: "CUSTOM_SPLIT",
      perPersonAmountPaise: null,
      joinCode: "777777",
    });

    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, unpaidPool.id, INVITEE_PHONE, 250000),
    ).rejects.toThrow(OrganizerNotAMemberError);
  });

  it("rejects a phone number with no registered User", async () => {
    const { invitationService, pool } = await makeService();
    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, pool.id, "+919999999999", 250000),
    ).rejects.toThrow(InviteeNotRegisteredError);
  });

  it("rejects inviting someone who is already a Member of this Pool", async () => {
    const { invitationService, pool, membershipRepository } = await makeService();
    await membershipRepository.create(pool.id, INVITEE_ID, "MEMBER");

    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000),
    ).rejects.toThrow(InviteeAlreadyMemberError);
  });

  it("rejects a second Invitation while one is still pending", async () => {
    const { invitationService, pool } = await makeService();
    await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 300000),
    ).rejects.toThrow(InvitationAlreadyPendingError);
  });

  it("applies the given expiry preset to expiresAt", async () => {
    const clock = new Date("2026-01-01T00:00:00Z");
    const { invitationService, pool } = await makeService(() => clock);

    const invitation = await invitationService.sendInvitation(
      ORGANIZER_ID,
      pool.id,
      INVITEE_PHONE,
      250000,
      "24h",
    );

    expect(invitation.expiresAt.getTime()).toBe(clock.getTime() + 24 * 60 * 60 * 1000);
  });

  it("defaults to a 7-day expiry when no preset is given", async () => {
    const clock = new Date("2026-01-01T00:00:00Z");
    const { invitationService, pool } = await makeService(() => clock);

    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    expect(invitation.expiresAt.getTime()).toBe(clock.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("rejects an invalid expiry preset", async () => {
    const { invitationService, pool } = await makeService();
    await expect(
      invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000, "9d" as never),
    ).rejects.toThrow(InvalidInvitationExpiryPresetError);
  });

  it("allows a fresh Invitation once the prior one has lazily expired", async () => {
    let clock = new Date("2026-01-01T00:00:00Z");
    const { invitationService, pool } = await makeService(() => clock);

    await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    clock = new Date("2026-01-09T00:00:00Z"); // 8 days later — past the 7-day default expiry
    const second = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 300000);
    expect(second.assignedAmountPaise).toBe(300000);
  });
});

describe("InvitationService.listMyInvitations", () => {
  it("returns the invitee's pending Invitations enriched with Pool and Organizer name", async () => {
    const { invitationService, pool } = await makeService();
    await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    const invitations = await invitationService.listMyInvitations(INVITEE_ID);

    expect(invitations).toHaveLength(1);
    expect(invitations[0].invitation.assignedAmountPaise).toBe(250000);
    expect(invitations[0].pool.name).toBe("Munnar Trip");
    expect(invitations[0].organizerName).toBe("Rhea");
  });

  it("excludes a lazily-expired Invitation", async () => {
    let clock = new Date("2026-01-01T00:00:00Z");
    const { invitationService, pool } = await makeService(() => clock);
    await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    clock = new Date("2026-01-09T00:00:00Z");
    const invitations = await invitationService.listMyInvitations(INVITEE_ID);
    expect(invitations).toHaveLength(0);
  });

  it("returns nothing for a user with no Invitations", async () => {
    const { invitationService } = await makeService();
    expect(await invitationService.listMyInvitations("user_nobody")).toEqual([]);
  });
});

describe("InvitationService.listSentInvitations", () => {
  it("returns every Invitation sent for a Pool, enriched with the invitee's identity", async () => {
    const { invitationService, pool } = await makeService();
    await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    const sent = await invitationService.listSentInvitations(pool.id, ORGANIZER_ID);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      inviteeName: "Dev",
      inviteePhoneNumber: INVITEE_PHONE,
    });
    expect(sent[0].invitation.assignedAmountPaise).toBe(250000);
  });

  it("rejects a non-Organizer requester", async () => {
    const { invitationService, pool } = await makeService();
    await expect(invitationService.listSentInvitations(pool.id, "user_stranger")).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { invitationService } = await makeService();
    await expect(invitationService.listSentInvitations("does-not-exist", ORGANIZER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});

describe("InvitationService.cancelInvitation", () => {
  it("cancels a pending Invitation", async () => {
    const { invitationService, pool } = await makeService();
    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    const cancelled = await invitationService.cancelInvitation(ORGANIZER_ID, pool.id, invitation.id);

    expect(cancelled.state).toBe("CANCELLED");
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { invitationService } = await makeService();
    await expect(
      invitationService.cancelInvitation(ORGANIZER_ID, "does-not-exist", "invitation_1"),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a non-Organizer requester", async () => {
    const { invitationService, pool } = await makeService();
    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    await expect(
      invitationService.cancelInvitation("user_stranger", pool.id, invitation.id),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("throws InvitationRecordNotFoundError for an unknown invitation id", async () => {
    const { invitationService, pool } = await makeService();
    await expect(
      invitationService.cancelInvitation(ORGANIZER_ID, pool.id, "does-not-exist"),
    ).rejects.toThrow(InvitationRecordNotFoundError);
  });

  it("throws InvitationRecordNotFoundError for an invitation belonging to a different pool", async () => {
    const { invitationService, pool, poolRepository, membershipRepository } = await makeService();
    const otherPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Other Pool",
      type: "CUSTOM_SPLIT",
      perPersonAmountPaise: null,
      joinCode: "888888",
    });
    await membershipRepository.create(otherPool.id, ORGANIZER_ID, "ORGANIZER");
    const invitation = await invitationService.sendInvitation(
      ORGANIZER_ID,
      otherPool.id,
      INVITEE_PHONE,
      250000,
    );

    await expect(
      invitationService.cancelInvitation(ORGANIZER_ID, pool.id, invitation.id),
    ).rejects.toThrow(InvitationRecordNotFoundError);
  });

  it("throws InvitationNotCancellableError for an already-paid Invitation", async () => {
    const { invitationService, pool, invitationRepository } = await makeService();
    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);
    await invitationRepository.markPaid(invitation.id);

    await expect(
      invitationService.cancelInvitation(ORGANIZER_ID, pool.id, invitation.id),
    ).rejects.toThrow(InvitationNotCancellableError);
  });

  it("throws InvitationNotCancellableError for an already-cancelled Invitation", async () => {
    const { invitationService, pool } = await makeService();
    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);
    await invitationService.cancelInvitation(ORGANIZER_ID, pool.id, invitation.id);

    await expect(
      invitationService.cancelInvitation(ORGANIZER_ID, pool.id, invitation.id),
    ).rejects.toThrow(InvitationNotCancellableError);
  });

  it("does not clobber a payment that confirms between the pre-check and the write (race guard)", async () => {
    const { invitationService, pool, invitationRepository } = await makeService();
    const invitation = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    // Simulate the payment confirming in the window between cancelInvitation's
    // findById pre-check and its markCancelled write: the pre-check still
    // sees a stale PENDING snapshot while the stored row has already moved
    // to PAID underneath it.
    const staleSnapshot = { ...invitation };
    const originalFindById = invitationRepository.findById.bind(invitationRepository);
    invitationRepository.findById = async (id: string) =>
      id === invitation.id ? staleSnapshot : originalFindById(id);
    await invitationRepository.markPaid(invitation.id);

    await expect(
      invitationService.cancelInvitation(ORGANIZER_ID, pool.id, invitation.id),
    ).rejects.toThrow(InvitationNotCancellableError);

    const stored = await originalFindById(invitation.id);
    expect(stored?.state).toBe("PAID");
  });
});

describe("InvitationService.getInvitationByToken", () => {
  it("resolves the Invitation for its rightful invitee, enriched with Pool and Organizer name", async () => {
    const { invitationService, pool } = await makeService();
    const sent = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    const resolved = await invitationService.getInvitationByToken(sent.token, INVITEE_ID);

    expect(resolved.invitation.id).toBe(sent.id);
    expect(resolved.invitation.assignedAmountPaise).toBe(250000);
    expect(resolved.pool.name).toBe("Munnar Trip");
    expect(resolved.organizerName).toBe("Rhea");
  });

  it("rejects a signed-in user other than the named invitee, without leaking Pool or amount", async () => {
    const { invitationService, pool } = await makeService();
    const sent = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    await expect(invitationService.getInvitationByToken(sent.token, "user_stranger")).rejects.toThrow(
      InvitationLinkNotFoundError,
    );
    // Even the Organizer who sent it can't open it as themselves — the link
    // is bound to the invitee alone.
    await expect(invitationService.getInvitationByToken(sent.token, ORGANIZER_ID)).rejects.toThrow(
      InvitationLinkNotFoundError,
    );
  });

  it("throws the same error for an unknown token as for a mismatched account", async () => {
    const { invitationService } = await makeService();
    await expect(invitationService.getInvitationByToken("not-a-real-token", INVITEE_ID)).rejects.toThrow(
      InvitationLinkNotFoundError,
    );
  });

  it("still resolves a lazily-expired Invitation for its rightful invitee", async () => {
    let clock = new Date("2026-01-01T00:00:00Z");
    const { invitationService, pool } = await makeService(() => clock);
    const sent = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    clock = new Date("2026-01-09T00:00:00Z"); // past the 7-day default expiry
    const resolved = await invitationService.getInvitationByToken(sent.token, INVITEE_ID);
    expect(resolved.invitation.id).toBe(sent.id);
  });
});

describe("InvitationService.sendEqualSplitInvitation", () => {
  it("sends an Invitation with no assigned amount and notifies the invitee", async () => {
    const { invitationService, poolRepository, membershipRepository, notificationRepository } =
      await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);

    const invitation = await invitationService.sendEqualSplitInvitation(
      ORGANIZER_ID,
      equalSplitPool.id,
      INVITEE_PHONE,
    );

    expect(invitation).toMatchObject({
      poolId: equalSplitPool.id,
      inviteeUserId: INVITEE_ID,
      assignedAmountPaise: null,
      state: "PENDING",
    });

    const notifications = await notificationRepository.listByUser(INVITEE_ID);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ poolId: equalSplitPool.id, type: "INVITATION_RECEIVED" });
  });

  it("rejects sending on a Custom Split Pool", async () => {
    const { invitationService, pool } = await makeService();
    await expect(
      invitationService.sendEqualSplitInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE),
    ).rejects.toThrow(NotEqualSplitPoolError);
  });

  it("rejects a non-Organizer sender", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);

    await expect(
      invitationService.sendEqualSplitInvitation("user_stranger", equalSplitPool.id, INVITEE_PHONE),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects an Organizer who hasn't paid their own share yet", async () => {
    const { invitationService, poolRepository } = await makeService();
    const unpaidPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Unpaid Equal Split Pool",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "777778",
    });

    await expect(
      invitationService.sendEqualSplitInvitation(ORGANIZER_ID, unpaidPool.id, INVITEE_PHONE),
    ).rejects.toThrow(OrganizerNotAMemberError);
  });

  it("rejects a phone number with no registered User", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);

    await expect(
      invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, "+919999999999"),
    ).rejects.toThrow(InviteeNotRegisteredError);
  });

  it("rejects inviting someone who is already a Member of this Pool", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);
    await membershipRepository.create(equalSplitPool.id, INVITEE_ID, "MEMBER");

    await expect(
      invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE),
    ).rejects.toThrow(InviteeAlreadyMemberError);
  });

  it("rejects a second Invitation while one is still pending", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);
    await invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE);

    await expect(
      invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE),
    ).rejects.toThrow(InvitationAlreadyPendingError);
  });
});

describe("InvitationService.acceptInvitation", () => {
  it("creates a Membership immediately at zero cost, no Deposit involved", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);
    const sent = await invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE);

    const membership = await invitationService.acceptInvitation(sent.id, INVITEE_ID);

    expect(membership).toMatchObject({
      poolId: equalSplitPool.id,
      userId: INVITEE_ID,
      role: "MEMBER",
    });
    const stored = await membershipRepository.find(equalSplitPool.id, INVITEE_ID);
    expect(stored).not.toBeNull();
  });

  it("marks the Invitation resolved so it can't be accepted twice", async () => {
    const { invitationService, poolRepository, membershipRepository, invitationRepository } =
      await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);
    const sent = await invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE);
    await invitationService.acceptInvitation(sent.id, INVITEE_ID);

    const stored = await invitationRepository.findById(sent.id);
    expect(stored?.state).toBe("PAID");

    await expect(invitationService.acceptInvitation(sent.id, INVITEE_ID)).rejects.toThrow(
      InvitationNotAcceptableError,
    );
  });

  it("rejects an unknown Invitation id", async () => {
    const { invitationService } = await makeService();
    await expect(invitationService.acceptInvitation("does-not-exist", INVITEE_ID)).rejects.toThrow(
      InvitationNotFoundForAccepterError,
    );
  });

  it("throws the same error for someone else's Invitation, without leaking its existence", async () => {
    const { invitationService, poolRepository, membershipRepository } = await makeService();
    const equalSplitPool = await makeEqualSplitPool(poolRepository, membershipRepository);
    const sent = await invitationService.sendEqualSplitInvitation(ORGANIZER_ID, equalSplitPool.id, INVITEE_PHONE);

    await expect(invitationService.acceptInvitation(sent.id, "user_stranger")).rejects.toThrow(
      InvitationNotFoundForAccepterError,
    );
  });

  it("rejects accepting a Custom Split Invitation — it must be paid, not just accepted", async () => {
    const { invitationService, pool } = await makeService();
    const sent = await invitationService.sendInvitation(ORGANIZER_ID, pool.id, INVITEE_PHONE, 250000);

    await expect(invitationService.acceptInvitation(sent.id, INVITEE_ID)).rejects.toThrow(
      InvitationRequiresPaymentError,
    );
  });
});
