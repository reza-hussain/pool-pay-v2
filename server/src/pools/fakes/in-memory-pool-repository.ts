import type { Pool, PoolRepository, PoolType } from "../types.js";

let nextId = 1;

export class InMemoryPoolRepository implements PoolRepository {
  pools: Pool[] = [];

  async create(
    organizerId: string,
    data: { name: string; type: PoolType; perPersonAmountPaise: number | null },
  ): Promise<Pool> {
    const pool: Pool = {
      id: `pool_${nextId++}`,
      name: data.name,
      type: data.type,
      perPersonAmountPaise: data.perPersonAmountPaise,
      state: "ACTIVE",
      organizerId,
      createdAt: new Date(),
    };
    this.pools.push(pool);
    return pool;
  }
}
