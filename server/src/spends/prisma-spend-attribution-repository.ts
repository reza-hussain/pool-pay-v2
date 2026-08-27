import type { PrismaClient } from "@prisma/client";
import type { SpendAttribution, SpendAttributionRepository } from "./types.js";

export class PrismaSpendAttributionRepository implements SpendAttributionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForSpend(
    spendId: string,
    poolId: string,
    shares: Array<{ memberId: string; amountPaise: number }>,
  ): Promise<SpendAttribution[]> {
    return Promise.all(
      shares.map((share) =>
        this.prisma.spendAttribution.create({
          data: { spendId, poolId, memberId: share.memberId, amountPaise: share.amountPaise },
        }),
      ),
    );
  }

  async sumByPoolAndMember(poolId: string, memberId: string): Promise<number> {
    const result = await this.prisma.spendAttribution.aggregate({
      where: { poolId, memberId },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0;
  }

  async listByPool(poolId: string): Promise<SpendAttribution[]> {
    return this.prisma.spendAttribution.findMany({ where: { poolId } });
  }

  async listBySpend(spendId: string): Promise<SpendAttribution[]> {
    return this.prisma.spendAttribution.findMany({ where: { spendId } });
  }
}
