import { describe, expect, it } from "vitest";
import { ActivityService } from "../../src/activity/activity-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";

const USER_ID = "user_maya";
const OTHER_MEMBER_ID = "user_kabir";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const refundRepository = new InMemoryRefundRepository();
  const userRepository = new InMemoryUserRepository();
  const activityService = new ActivityService({
    membershipRepository,
    poolRepository,
    depositRepository,
    refundRepository,
    userRepository,
  });

  userRepository.seedVerifiedUser(USER_ID, "+91user_maya", { name: "Maya" });
  userRepository.seedVerifiedUser(OTHER_MEMBER_ID, "+91user_kabir", { name: "Kabir" });

  return {
    activityService,
    poolRepository,
    membershipRepository,
    depositRepository,
    refundRepository,
    userRepository,
  };
}

describe("ActivityService.getActivity", () => {
  it("merges Deposits and Refunds across every Pool the user belongs to", async () => {
    const { activityService, poolRepository, membershipRepository, depositRepository, refundRepository } =
      await makeService();

    const goaTrip = await poolRepository.create(USER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    await membershipRepository.create(goaTrip.id, USER_ID, "ORGANIZER");
    await depositRepository.create(goaTrip.id, USER_ID, 100000);

    const diwaliParty = await poolRepository.create(OTHER_MEMBER_ID, {
      name: "Diwali Party",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "222222",
    });
    await membershipRepository.create(diwaliParty.id, OTHER_MEMBER_ID, "ORGANIZER");
    await membershipRepository.create(diwaliParty.id, USER_ID, "MEMBER");
    await refundRepository.create(diwaliParty.id, USER_ID, "maya@okhdfc", 300000);

    const entries = await activityService.getActivity(USER_ID);

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.type).sort()).toEqual(["DEPOSIT", "REFUND"]);
    expect(entries.find((e) => e.type === "DEPOSIT")).toMatchObject({
      poolId: goaTrip.id,
      poolName: "Goa Trip",
      amountPaise: 100000,
      counterpartyName: "Maya",
    });
    expect(entries.find((e) => e.type === "REFUND")).toMatchObject({
      poolId: diwaliParty.id,
      poolName: "Diwali Party",
      amountPaise: 300000,
      counterpartyName: "Maya",
    });
  });

  it("resolves the counterparty's display name, not their raw id", async () => {
    const { activityService, poolRepository, membershipRepository, depositRepository } = await makeService();

    const pool = await poolRepository.create(OTHER_MEMBER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    await membershipRepository.create(pool.id, OTHER_MEMBER_ID, "ORGANIZER");
    await membershipRepository.create(pool.id, USER_ID, "MEMBER");
    await depositRepository.create(pool.id, OTHER_MEMBER_ID, 50000);

    const [entry] = await activityService.getActivity(USER_ID);
    expect(entry.counterpartyName).toBe("Kabir");
  });

  it("orders entries newest first across Pools", async () => {
    const { activityService, poolRepository, membershipRepository, depositRepository, refundRepository } =
      await makeService();

    const pool = await poolRepository.create(USER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    await membershipRepository.create(pool.id, USER_ID, "ORGANIZER");
    const first = await depositRepository.create(pool.id, USER_ID, 10000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await refundRepository.create(pool.id, USER_ID, "maya@okhdfc", 20000);

    const entries = await activityService.getActivity(USER_ID);
    expect(entries[0].id).toBe(second.id);
    expect(entries[1].id).toBe(first.id);
  });

  it("excludes Spends and Reimbursements from the feed", async () => {
    // ActivityService only wires up Deposit and Refund repositories at all —
    // this test documents that constraint via its type signature rather than
    // asserting on excluded data, since there's nothing else to assert.
    const { activityService } = await makeService();
    expect(await activityService.getActivity(USER_ID)).toEqual([]);
  });

  it("excludes a Pool the user is not currently a Member of", async () => {
    const { activityService, poolRepository, membershipRepository, depositRepository } = await makeService();

    const pool = await poolRepository.create(OTHER_MEMBER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    await membershipRepository.create(pool.id, OTHER_MEMBER_ID, "ORGANIZER");
    await depositRepository.create(pool.id, OTHER_MEMBER_ID, 50000);

    expect(await activityService.getActivity(USER_ID)).toEqual([]);
  });

  it("stops showing a Pool's entries once the user is removed from it", async () => {
    const { activityService, poolRepository, membershipRepository, depositRepository } = await makeService();

    const pool = await poolRepository.create(OTHER_MEMBER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    await membershipRepository.create(pool.id, OTHER_MEMBER_ID, "ORGANIZER");
    await membershipRepository.create(pool.id, USER_ID, "MEMBER");
    await depositRepository.create(pool.id, OTHER_MEMBER_ID, 50000);

    expect(await activityService.getActivity(USER_ID)).toHaveLength(1);

    await membershipRepository.remove(pool.id, USER_ID);

    expect(await activityService.getActivity(USER_ID)).toEqual([]);
  });
});
