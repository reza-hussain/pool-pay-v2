import type { PrismaClient } from "@prisma/client";
import type { Refund, RefundRepository } from "./types.js";

export class PrismaRefundRepository implements RefundRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(poolId: string, memberId: string, vpa: string, amountPaise: number): Promise<Refund> {
    return this.prisma.refund.create({ data: { poolId, memberId, vpa, amountPaise } });
  }

  async sumByPool(poolId: string): Promise<number> {
    const result = await this.prisma.refund.aggregate({
      where: { poolId },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0;
  }

  async listByPool(poolId: string): Promise<Refund[]> {
    return this.prisma.refund.findMany({ where: { poolId } });
  }
}
