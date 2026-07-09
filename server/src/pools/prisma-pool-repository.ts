import type { PrismaClient } from "@prisma/client";
import type { Pool, PoolRepository, PoolType } from "./types.js";

export class PrismaPoolRepository implements PoolRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    organizerId: string,
    data: { name: string; type: PoolType; perPersonAmountPaise: number | null },
  ): Promise<Pool> {
    const row = await this.prisma.pool.create({
      data: {
        name: data.name,
        type: data.type,
        perPersonAmountPaise: data.perPersonAmountPaise,
        organizerId,
      },
    });
    return { ...row, type: row.type as PoolType, state: row.state as Pool["state"] };
  }
}
