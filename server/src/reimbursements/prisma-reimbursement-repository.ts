import type { PrismaClient } from "@prisma/client";
import type { Reimbursement, ReimbursementRepository } from "./types.js";

export class PrismaReimbursementRepository implements ReimbursementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    poolId: string,
    memberId: string,
    vpa: string,
    amountPaise: number,
  ): Promise<Reimbursement> {
    return this.prisma.reimbursement.create({ data: { poolId, memberId, vpa, amountPaise } });
  }

  async sumByPool(poolId: string): Promise<number> {
    const result = await this.prisma.reimbursement.aggregate({
      where: { poolId },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0;
  }

  async listByPool(poolId: string): Promise<Reimbursement[]> {
    return this.prisma.reimbursement.findMany({ where: { poolId } });
  }
}
