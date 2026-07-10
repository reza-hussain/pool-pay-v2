import type { PrismaClient } from "@prisma/client";
import type { CreatePoolData, Pool, PoolRepository, PoolState, PoolType } from "./types.js";

export class PrismaPoolRepository implements PoolRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(organizerId: string, data: CreatePoolData): Promise<Pool> {
    const row = await this.prisma.pool.create({
      data: {
        name: data.name,
        type: data.type,
        perPersonAmountPaise: data.perPersonAmountPaise,
        joinCode: data.joinCode,
        organizerId,
      },
    });
    return toPool(row);
  }

  async findById(id: string): Promise<Pool | null> {
    const row = await this.prisma.pool.findUnique({ where: { id } });
    return row ? toPool(row) : null;
  }

  async findByJoinCode(joinCode: string): Promise<Pool | null> {
    const row = await this.prisma.pool.findUnique({ where: { joinCode } });
    return row ? toPool(row) : null;
  }

  async updateState(id: string, state: PoolState): Promise<Pool> {
    const row = await this.prisma.pool.update({ where: { id }, data: { state } });
    return toPool(row);
  }

  async listByOrganizer(organizerId: string): Promise<Pool[]> {
    const rows = await this.prisma.pool.findMany({ where: { organizerId } });
    return rows.map(toPool);
  }
}

function toPool(row: {
  id: string;
  name: string;
  type: string;
  perPersonAmountPaise: number | null;
  state: string;
  organizerId: string;
  createdAt: Date;
  joinCode: string;
}): Pool {
  return { ...row, type: row.type as PoolType, state: row.state as Pool["state"] };
}
