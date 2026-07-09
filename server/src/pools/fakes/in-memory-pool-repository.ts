import type { CreatePoolData, Pool, PoolRepository } from "../types.js";

let nextId = 1;

export class InMemoryPoolRepository implements PoolRepository {
  pools: Pool[] = [];

  async create(organizerId: string, data: CreatePoolData): Promise<Pool> {
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
