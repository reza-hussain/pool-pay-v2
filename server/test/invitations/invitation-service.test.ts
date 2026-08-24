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
  InvitationAlreadyPendingError,
  InvitationLinkNotFoundError,
  InviteeAlreadyMemberError,
  InviteeNotRegisteredError,
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
