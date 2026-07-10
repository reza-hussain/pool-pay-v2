import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/analytics-service.js";
import { NotSubscribedError } from "../../src/analytics/types.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";

const ORGANIZER_ID = "user_organizer";
const OTHER_ORGANIZER_ID = "user_other_organizer";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const spendRepository = new InMemorySpendRepository();
  const userRepository = new InMemoryUserRepository();
  userRepository.seedVerifiedUser(ORGANIZER_ID);
  const analyticsService = new AnalyticsService({ userRepository, poolRepository, spendRepository });

  return { analyticsService, poolRepository, spendRepository, userRepository };
}

describe("AnalyticsService.getCrossPoolAnalytics", () => {
  it("aggregates Spends across every Pool the user organizes", async () => {
    const { analyticsService, poolRepository, spendRepository, userRepository } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID);
    const poolA = await poolRepository.create(ORGANIZER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    const poolB = await poolRepository.create(ORGANIZER_ID, {
      name: "Flat Rent",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "222222",
    });
    await spendRepository.create(poolA.id, ORGANIZER_ID, "hotel@upi", 50000, 500);
    await spendRepository.create(poolB.id, ORGANIZER_ID, "landlord@upi", 30000, 300);

    const analytics = await analyticsService.getCrossPoolAnalytics(ORGANIZER_ID);

    expect(analytics.poolCount).toBe(2);
    expect(analytics.totalSpendPaise).toBe(80000);
  });

  it("breaks spend down by merchant reference", async () => {
    const { analyticsService, poolRepository, spendRepository, userRepository } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID);
    const pool = await poolRepository.create(ORGANIZER_ID, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "111111",
    });
    await spendRepository.create(pool.id, ORGANIZER_ID, "hotel@upi", 50000, 500);
    await spendRepository.create(pool.id, ORGANIZER_ID, "hotel@upi", 20000, 200);
    await spendRepository.create(pool.id, ORGANIZER_ID, "cab@upi", 10000, 100);

    const analytics = await analyticsService.getCrossPoolAnalytics(ORGANIZER_ID);

    expect(analytics.byMerchant).toEqual(
      expect.arrayContaining([
        { merchantRef: "hotel@upi", amountPaise: 70000 },
        { merchantRef: "cab@upi", amountPaise: 10000 },
      ]),
    );
  });

  it("does not include another user's Pools", async () => {
    const { analyticsService, poolRepository, spendRepository, userRepository } = await makeService();
    await userRepository.subscribe(ORGANIZER_ID);
    const theirPool = await poolRepository.create(OTHER_ORGANIZER_ID, {
      name: "Someone Else's Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "999999",
    });
    await spendRepository.create(theirPool.id, OTHER_ORGANIZER_ID, "merchant@upi", 99999, 999);

    const analytics = await analyticsService.getCrossPoolAnalytics(ORGANIZER_ID);

    expect(analytics.poolCount).toBe(0);
    expect(analytics.totalSpendPaise).toBe(0);
  });

  it("rejects a non-subscribed user", async () => {
    const { analyticsService } = await makeService();

    await expect(analyticsService.getCrossPoolAnalytics(ORGANIZER_ID)).rejects.toThrow(
      NotSubscribedError,
    );
  });

  it("rejects a user who was never created at all", async () => {
    const { analyticsService } = await makeService();

    await expect(
      analyticsService.getCrossPoolAnalytics("user_never_signed_up"),
    ).rejects.toThrow(NotSubscribedError);
  });
});
