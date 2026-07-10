import type { PoolRepository } from "../pools/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { UserRepository } from "../auth/types.js";
import { NotSubscribedError, type CrossPoolAnalytics } from "./types.js";

export interface AnalyticsServiceOptions {
  userRepository: UserRepository;
  poolRepository: PoolRepository;
  spendRepository: SpendRepository;
}

export class AnalyticsService {
  private readonly userRepository: UserRepository;
  private readonly poolRepository: PoolRepository;
  private readonly spendRepository: SpendRepository;

  constructor(options: AnalyticsServiceOptions) {
    this.userRepository = options.userRepository;
    this.poolRepository = options.poolRepository;
    this.spendRepository = options.spendRepository;
  }

  // Scoped to Pools the user organizes — Spends are always initiated by the
  // Organizer (ADR 0004, single-organizer authority), so that's the only
  // Pool set "spending" can be aggregated across.
  async getCrossPoolAnalytics(userId: string): Promise<CrossPoolAnalytics> {
    const user = await this.userRepository.findById(userId);
    if (!user?.isSubscribed) {
      throw new NotSubscribedError();
    }

    const pools = await this.poolRepository.listByOrganizer(userId);
    const spendsByPool = await Promise.all(pools.map((pool) => this.spendRepository.listByPool(pool.id)));
    const allSpends = spendsByPool.flat();

    const byMerchantMap = new Map<string, number>();
    for (const spend of allSpends) {
      byMerchantMap.set(
        spend.merchantRef,
        (byMerchantMap.get(spend.merchantRef) ?? 0) + spend.amountPaise,
      );
    }

    return {
      poolCount: pools.length,
      totalSpendPaise: allSpends.reduce((sum, spend) => sum + spend.amountPaise, 0),
      byMerchant: [...byMerchantMap.entries()].map(([merchantRef, amountPaise]) => ({
        merchantRef,
        amountPaise,
      })),
    };
  }
}
