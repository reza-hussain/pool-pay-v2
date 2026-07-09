import type { Spend, SpendRepository } from "../types.js";

let nextId = 1;

export class InMemorySpendRepository implements SpendRepository {
  spends: Spend[] = [];

  async create(
    poolId: string,
    userId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<Spend> {
    const spend: Spend = {
      id: `spend_${nextId++}`,
      poolId,
      userId,
      merchantRef,
      amountPaise,
      feePaise,
      createdAt: new Date(),
    };
    this.spends.push(spend);
    return spend;
  }

  async sumByPool(poolId: string): Promise<number> {
    return this.spends
      .filter((s) => s.poolId === poolId)
      .reduce((sum, s) => sum + s.amountPaise + s.feePaise, 0);
  }

  async listByPool(poolId: string): Promise<Spend[]> {
    return this.spends.filter((s) => s.poolId === poolId);
  }
}
