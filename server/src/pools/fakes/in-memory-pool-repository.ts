import type { CreatePoolData, Pool, PoolRepository, PoolState } from "../types.js";

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
      joinCode: data.joinCode,
    };
    this.pools.push(pool);
    return pool;
  }

  async findById(id: string): Promise<Pool | null> {
    return this.pools.find((p) => p.id === id) ?? null;
  }

  async findByJoinCode(joinCode: string): Promise<Pool | null> {
    return this.pools.find((p) => p.joinCode === joinCode) ?? null;
  }

  async updateState(id: string, state: PoolState): Promise<Pool> {
    const pool = this.pools.find((p) => p.id === id);
    if (!pool) {
      throw new Error(`Pool ${id} not found`);
    }
    pool.state = state;
    return pool;
  }
}
