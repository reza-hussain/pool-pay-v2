import { describe, expect, it } from "vitest";
import { JoinRequestService } from "../../src/join-requests/join-request-service.js";
import { InMemoryJoinRequestRepository } from "../../src/join-requests/fakes/in-memory-join-request-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";
import {
  JoinRequestAlreadyDeclinedError,
  JoinRequestNotFoundError,
  JoinRequestNotPendingError,
} from "../../src/join-requests/types.js";

const ORGANIZER_ID = "user_organizer";
const REQUESTER_ID = "user_requester";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const joinRequestRepository = new InMemoryJoinRequestRepository();
  const userRepository = new InMemoryUserRepository();
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });

  userRepository.seedVerifiedUser(ORGANIZER_ID, undefined, { name: "Rhea" });
  userRepository.seedVerifiedUser(REQUESTER_ID, "+919876500001", { name: "Dev" });

  const joinRequestService = new JoinRequestService({
    joinRequestRepository,
    membershipRepository,
    poolRepository,
    userRepository,
    notificationService,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "EQUAL_SPLIT",
    perPersonAmountPaise: 100000,
    joinCode: "555555",
  });
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");

  return {
    joinRequestService,
    joinRequestRepository,
    poolRepository,
    membershipRepository,
    userRepository,
    notificationRepository,
    pool,
  };
}

describe("JoinRequestService.requestToJoin", () => {
  it("creates a PENDING Join Request and notifies the Organizer", async () => {
    const { joinRequestService, pool, notificationRepository } = await makeService();

    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    expect(joinRequest).toMatchObject({
      poolId: pool.id,
      requesterUserId: REQUESTER_ID,
      state: "PENDING",
    });
    expect(joinRequest.decidedAt).toBeNull();

    const notifications = await notificationRepository.listByUser(ORGANIZER_ID);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ poolId: pool.id, type: "JOIN_REQUEST_RECEIVED" });
    expect(notifications[0].message).toContain("Dev");
  });

  it("is idempotent while a request is still PENDING — returns the same one, no duplicate", async () => {
    const { joinRequestService, joinRequestRepository, pool } = await makeService();

    const first = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    const second = await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    expect(second.id).toBe(first.id);
    expect(joinRequestRepository.joinRequests.filter((r) => r.requesterUserId === REQUESTER_ID)).toHaveLength(1);
  });

  it("blocks an immediate re-request after the Organizer declines", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    await joinRequestService.decline(ORGANIZER_ID, pool.id, joinRequest.id);

    await expect(joinRequestService.requestToJoin(pool, REQUESTER_ID)).rejects.toThrow(
      JoinRequestAlreadyDeclinedError,
    );
  });

  it("stays actionable no matter how long it has been PENDING — no auto-expiry", async () => {
    const { joinRequestService, joinRequestRepository, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    // Simulate a request that's been sitting PENDING for a very long time —
    // there's no expiresAt field to lapse it, and nothing should filter it
    // out based on age (ticket #86 AC).
    const stored = joinRequestRepository.joinRequests.find((r) => r.id === joinRequest.id)!;
    stored.createdAt = new Date("2000-01-01T00:00:00Z");

    const pending = await joinRequestService.listPendingRequests(ORGANIZER_ID, pool.id);
    expect(pending.map((p) => p.joinRequest.id)).toContain(joinRequest.id);

    const approved = await joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id);
    expect(approved.state).toBe("APPROVED");
  });
});

describe("JoinRequestService.listPendingRequests", () => {
  it("returns every PENDING request for the Pool, enriched with the requester's identity", async () => {
    const { joinRequestService, pool } = await makeService();
    await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    const pending = await joinRequestService.listPendingRequests(ORGANIZER_ID, pool.id);

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      requesterName: "Dev",
      requesterPhoneNumber: "+919876500001",
    });
    expect(pending[0].joinRequest.requesterUserId).toBe(REQUESTER_ID);
  });

  it("excludes an already-decided request", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    await joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id);

    expect(await joinRequestService.listPendingRequests(ORGANIZER_ID, pool.id)).toEqual([]);
  });

  it("rejects a non-Organizer requester", async () => {
    const { joinRequestService, pool } = await makeService();
    await expect(joinRequestService.listPendingRequests(REQUESTER_ID, pool.id)).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { joinRequestService } = await makeService();
    await expect(joinRequestService.listPendingRequests(ORGANIZER_ID, "does-not-exist")).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});

describe("JoinRequestService.approve", () => {
  it("creates a Membership for the requester and notifies them", async () => {
    const { joinRequestService, membershipRepository, notificationRepository, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    const approved = await joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id);

    expect(approved.state).toBe("APPROVED");
    expect(approved.decidedAt).not.toBeNull();
    const membership = await membershipRepository.find(pool.id, REQUESTER_ID);
    expect(membership).toMatchObject({ poolId: pool.id, userId: REQUESTER_ID, role: "MEMBER" });

    const notifications = await notificationRepository.listByUser(REQUESTER_ID);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ poolId: pool.id, type: "JOIN_REQUEST_APPROVED" });
  });

  it("rejects a non-Organizer requester", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    await expect(
      joinRequestService.approve(REQUESTER_ID, pool.id, joinRequest.id),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("throws PoolNotFoundError for an unknown pool", async () => {
    const { joinRequestService } = await makeService();
    await expect(
      joinRequestService.approve(ORGANIZER_ID, "does-not-exist", "join_request_1"),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("throws JoinRequestNotFoundError for an unknown request id", async () => {
    const { joinRequestService, pool } = await makeService();
    await expect(
      joinRequestService.approve(ORGANIZER_ID, pool.id, "does-not-exist"),
    ).rejects.toThrow(JoinRequestNotFoundError);
  });

  it("throws JoinRequestNotFoundError for a request belonging to a different Pool", async () => {
    const { joinRequestService, poolRepository, membershipRepository, pool } = await makeService();
    const otherPool = await poolRepository.create(ORGANIZER_ID, {
      name: "Other Pool",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 50000,
      joinCode: "999999",
    });
    await membershipRepository.create(otherPool.id, ORGANIZER_ID, "ORGANIZER");
    const joinRequest = await joinRequestService.requestToJoin(otherPool, REQUESTER_ID);

    await expect(
      joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id),
    ).rejects.toThrow(JoinRequestNotFoundError);
  });

  it("throws JoinRequestNotPendingError for an already-approved request", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    await joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id);

    await expect(
      joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id),
    ).rejects.toThrow(JoinRequestNotPendingError);
  });

  it("throws JoinRequestNotPendingError for an already-declined request", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    await joinRequestService.decline(ORGANIZER_ID, pool.id, joinRequest.id);

    await expect(
      joinRequestService.approve(ORGANIZER_ID, pool.id, joinRequest.id),
    ).rejects.toThrow(JoinRequestNotPendingError);
  });
});

describe("JoinRequestService.decline", () => {
  it("marks the request REJECTED without creating a Membership or sending a notification", async () => {
    const { joinRequestService, membershipRepository, notificationRepository, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    const declined = await joinRequestService.decline(ORGANIZER_ID, pool.id, joinRequest.id);

    expect(declined.state).toBe("REJECTED");
    expect(declined.decidedAt).not.toBeNull();
    expect(await membershipRepository.find(pool.id, REQUESTER_ID)).toBeNull();
    // Only the original JOIN_REQUEST_RECEIVED notification to the Organizer
    // exists — nothing was sent to the requester on decline.
    expect(await notificationRepository.listByUser(REQUESTER_ID)).toEqual([]);
  });

  it("rejects a non-Organizer requester", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);

    await expect(
      joinRequestService.decline(REQUESTER_ID, pool.id, joinRequest.id),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("throws JoinRequestNotPendingError for an already-decided request", async () => {
    const { joinRequestService, pool } = await makeService();
    const joinRequest = await joinRequestService.requestToJoin(pool, REQUESTER_ID);
    await joinRequestService.decline(ORGANIZER_ID, pool.id, joinRequest.id);

    await expect(
      joinRequestService.decline(ORGANIZER_ID, pool.id, joinRequest.id),
    ).rejects.toThrow(JoinRequestNotPendingError);
  });
});
