import type { PrismaClient } from "@prisma/client";
import type { Spend, SpendRepository } from "./types.js";

export class PrismaSpendRepository implements SpendRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    poolId: string,
    userId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<Spend> {
    return this.prisma.spend.create({
      data: { poolId, userId, merchantRef, amountPaise, feePaise },
    });
  }

  async sumByPool(poolId: string): Promise<number> {
    const result = await this.prisma.spend.aggregate({
      where: { poolId },
      _sum: { amountPaise: true, feePaise: true },
    });
    return (result._sum.amountPaise ?? 0) + (result._sum.feePaise ?? 0);
  }

  async listByPool(poolId: string): Promise<Spend[]> {
    return this.prisma.spend.findMany({ where: { poolId } });
  }
}
