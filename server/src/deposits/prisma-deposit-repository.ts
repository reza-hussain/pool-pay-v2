import type { PrismaClient } from "@prisma/client";
import type { Deposit, DepositRepository } from "./types.js";

export class PrismaDepositRepository implements DepositRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(poolId: string, userId: string, amountPaise: number): Promise<Deposit> {
    return this.prisma.deposit.create({ data: { poolId, userId, amountPaise } });
  }

  async findById(id: string): Promise<Deposit | null> {
    return this.prisma.deposit.findUnique({ where: { id } });
  }

  async sumByPool(poolId: string): Promise<number> {
    const result = await this.prisma.deposit.aggregate({
      where: { poolId },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0;
  }

  async sumByPoolAndUser(poolId: string, userId: string): Promise<number> {
    const result = await this.prisma.deposit.aggregate({
      where: { poolId, userId },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0;
  }

  async listByPool(poolId: string): Promise<Deposit[]> {
    return this.prisma.deposit.findMany({ where: { poolId } });
  }
}
