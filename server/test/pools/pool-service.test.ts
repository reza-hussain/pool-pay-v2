import { describe, expect, it } from "vitest";
import { PoolService } from "../../src/pools/pool-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";
import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MaxActivePoolsExceededError,
  MissingPerPersonAmountError,
  NotPoolOrganizerError,
  OrganizerNotVerifiedError,
  UnexpectedPerPersonAmountError,
} from "../../src/pools/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_1";

function makePoolService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });
  const poolService = new PoolService({
    poolRepository,
    membershipRepository,
    userRepository,
    notificationService,
  });
  return { poolService, poolRepository, membershipRepository, userRepository, notificationRepository };
}

describe("PoolService.createPool", () => {
  it("creates an Equal Split Pool with the organizer, ACTIVE state, and per-person amount", async () => {
    const { poolService } = makePoolService();

    const pool = await poolService.createPool(ORGANIZER_ID, {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
    });

    expect(pool.name).toBe("Goa Trip");
    expect(pool.type).toBe("EQUAL_SPLIT");
    expect(pool.perPersonAmountPaise).toBe(100000);
    expect(pool.state).toBe("ACTIVE");
    expect(pool.organizerId).toBe(ORGANIZER_ID);
  });

  it("assigns a six-digit join code", async () => {
    const { poolService } = makePoolService();

    const pool = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });

    expect(pool.joinCode).toMatch(/^\d{6}$/);
  });

  it("creates an ORGANIZER Membership for the creator", async () => {
    const { poolService, membershipRepository } = makePoolService();

    const pool = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });

    const membership = await membershipRepository.find(pool.id, ORGANIZER_ID);
    expect(membership).toMatchObject({ poolId: pool.id, userId: ORGANIZER_ID, role: "ORGANIZER" });
  });

  it("creates an Open Pool with no per-person amount", async () => {
    const { poolService } = makePoolService();

    const pool = await poolService.createPool(ORGANIZER_ID, {
      name: "Flat 3B Rent",
      type: "OPEN",
    });

    expect(pool.type).toBe("OPEN");
    expect(pool.perPersonAmountPaise).toBeNull();
    expect(pool.state).toBe("ACTIVE");
  });

  it("rejects a blank pool name", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "   ", type: "OPEN" }),
    ).rejects.toThrow(InvalidPoolNameError);
  });

  it("rejects an Equal Split Pool with no per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "EQUAL_SPLIT" }),
    ).rejects.toThrow(MissingPerPersonAmountError);
  });

  it("rejects an Equal Split Pool with a zero or negative per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: 0,
      }),
    ).rejects.toThrow(InvalidPerPersonAmountError);

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: -500,
      }),
    ).rejects.toThrow(InvalidPerPersonAmountError);
  });

  it("rejects a non-integer per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: 100.5,
      }),
    ).rejects.toThrow(InvalidPerPersonAmountError);
  });

  it("rejects an Open Pool that has a per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Flat 3B Rent",
        type: "OPEN",
        perPersonAmountPaise: 5000,
      }),
    ).rejects.toThrow(UnexpectedPerPersonAmountError);
  });

  it("rejects an unverified user (ticket #12)", async () => {
    const poolRepository = new InMemoryPoolRepository();
    const membershipRepository = new InMemoryMembershipRepository();
    const userRepository = new InMemoryUserRepository();
    const notificationService = new NotificationService({
      notificationRepository: new InMemoryNotificationRepository(),
    });
    // Not seeded as verified.
    const poolService = new PoolService({
      poolRepository,
      membershipRepository,
      userRepository,
      notificationService,
    });

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" }),
    ).rejects.toThrow(OrganizerNotVerifiedError);
  });

  it("rejects a user who was never created at all", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool("user_never_signed_up", { name: "Goa Trip", type: "OPEN" }),
    ).rejects.toThrow(OrganizerNotVerifiedError);
  });

  it("rejects a 4th concurrently Active Pool for a non-subscribed user (ticket #13)", async () => {
    const { poolService } = makePoolService();
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 1", type: "OPEN" });
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 2", type: "OPEN" });
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 3", type: "OPEN" });

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "Pool 4", type: "OPEN" }),
    ).rejects.toThrow(MaxActivePoolsExceededError);
  });

  it("does not count a Closed Pool against the free-tier cap", async () => {
    const { poolService, poolRepository } = makePoolService();
    const closed = await poolService.createPool(ORGANIZER_ID, { name: "Pool 1", type: "OPEN" });
    await poolRepository.updateState(closed.id, "CLOSED");
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 2", type: "OPEN" });
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 3", type: "OPEN" });

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "Pool 4", type: "OPEN" }),
    ).resolves.toMatchObject({ name: "Pool 4" });
  });

  it("allows a subscribed user unlimited concurrently Active Pools", async () => {
    const { poolService, userRepository } = makePoolService();
    await userRepository.subscribe(ORGANIZER_ID);
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 1", type: "OPEN" });
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 2", type: "OPEN" });
    await poolService.createPool(ORGANIZER_ID, { name: "Pool 3", type: "OPEN" });

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "Pool 4", type: "OPEN" }),
    ).resolves.toMatchObject({ name: "Pool 4" });
  });
});

describe("PoolService.lockPool", () => {
  it("sets an ACTIVE Pool to LOCKED when called by the Organizer", async () => {
    const { poolService } = makePoolService();
    const pool = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });

    const locked = await poolService.lockPool(pool.id, ORGANIZER_ID);

    expect(locked.state).toBe("LOCKED");
  });

  it("leaves balance and Membership untouched — Locked is not Closed", async () => {
    const { poolService, membershipRepository } = makePoolService();
    const pool = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });

    await poolService.lockPool(pool.id, ORGANIZER_ID);

    const membership = await membershipRepository.find(pool.id, ORGANIZER_ID);
    expect(membership).not.toBeNull();
  });

  it("rejects a non-Organizer with NotPoolOrganizerError", async () => {
    const { poolService } = makePoolService();
    const pool = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });

    await expect(poolService.lockPool(pool.id, "user_someone_else")).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });

  it("rejects an unknown Pool with PoolNotFoundError", async () => {
    const { poolService } = makePoolService();

    await expect(poolService.lockPool("pool_missing", ORGANIZER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("notifies every other current Member, but not the Organizer who locked it", async () => {
    const { poolService, membershipRepository, notificationRepository } = makePoolService();
    const pool = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });
    const memberId = "user_member";
    await membershipRepository.create(pool.id, memberId, "MEMBER");

    await poolService.lockPool(pool.id, ORGANIZER_ID);

    const memberNotifications = await notificationRepository.listByUser(memberId);
    expect(memberNotifications).toHaveLength(1);
    expect(memberNotifications[0]).toMatchObject({
      poolId: pool.id,
      type: "POOL_LOCKED",
      message: "Goa Trip was locked",
    });
    expect(await notificationRepository.listByUser(ORGANIZER_ID)).toHaveLength(0);
  });
});

describe("PoolService.listPoolsForUser", () => {
  const OTHER_ORGANIZER_ID = "user_other_organizer";

  function makePoolServiceWithTwoOrganizers() {
    const { poolService, membershipRepository, userRepository } = makePoolService();
    userRepository.seedVerifiedUser(OTHER_ORGANIZER_ID);
    return { poolService, membershipRepository, userRepository };
  }

  it("returns every Pool the user organizes or is a Member of", async () => {
    const { poolService, membershipRepository } = makePoolServiceWithTwoOrganizers();
    const organized = await poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "OPEN" });
    const joined = await poolService.createPool(OTHER_ORGANIZER_ID, {
      name: "Flat 3B Rent",
      type: "OPEN",
    });
    await membershipRepository.create(joined.id, ORGANIZER_ID, "MEMBER");

    const pools = await poolService.listPoolsForUser(ORGANIZER_ID);

    expect(pools.map((p) => p.id).sort()).toEqual([organized.id, joined.id].sort());
  });

  it("excludes Pools the user has no Membership in", async () => {
    const { poolService } = makePoolServiceWithTwoOrganizers();
    await poolService.createPool(OTHER_ORGANIZER_ID, { name: "Someone Else's Pool", type: "OPEN" });

    const pools = await poolService.listPoolsForUser(ORGANIZER_ID);

    expect(pools).toEqual([]);
  });

  it("excludes a Pool the user was removed from", async () => {
    const { poolService, membershipRepository } = makePoolServiceWithTwoOrganizers();
    const pool = await poolService.createPool(OTHER_ORGANIZER_ID, {
      name: "Flat 3B Rent",
      type: "OPEN",
    });
    await membershipRepository.create(pool.id, ORGANIZER_ID, "MEMBER");
    await membershipRepository.remove(pool.id, ORGANIZER_ID);

    const pools = await poolService.listPoolsForUser(ORGANIZER_ID);

    expect(pools).toEqual([]);
  });
});
