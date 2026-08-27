import type { SpendAttribution, SpendAttributionRepository } from "../types.js";

let nextId = 1;

export class InMemorySpendAttributionRepository implements SpendAttributionRepository {
  attributions: SpendAttribution[] = [];

  async createForSpend(
    spendId: string,
    poolId: string,
    shares: Array<{ memberId: string; amountPaise: number }>,
  ): Promise<SpendAttribution[]> {
    const created = shares.map(
      (share): SpendAttribution => ({
        id: `spend_attribution_${nextId++}`,
        spendId,
        poolId,
        memberId: share.memberId,
        amountPaise: share.amountPaise,
        createdAt: new Date(),
      }),
    );
    this.attributions.push(...created);
    return created;
  }

  async sumByPoolAndMember(poolId: string, memberId: string): Promise<number> {
    return this.attributions
      .filter((a) => a.poolId === poolId && a.memberId === memberId)
      .reduce((sum, a) => sum + a.amountPaise, 0);
  }

  async listByPool(poolId: string): Promise<SpendAttribution[]> {
    return this.attributions.filter((a) => a.poolId === poolId);
  }

  async listBySpend(spendId: string): Promise<SpendAttribution[]> {
    return this.attributions.filter((a) => a.spendId === spendId);
  }
}
