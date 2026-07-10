import type { PrismaClient } from "@prisma/client";
import type { PendingDeposit, PendingDepositRepository } from "./types.js";

export class PrismaPendingDepositRepository implements PendingDepositRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(providerRef: string, poolId: string, userId: string): Promise<PendingDeposit> {
    return this.prisma.pendingDeposit.create({ data: { providerRef, poolId, userId } });
  }

  async findByProviderRef(providerRef: string): Promise<PendingDeposit | null> {
    return this.prisma.pendingDeposit.findUnique({ where: { providerRef } });
  }

  async markConsumed(providerRef: string, resultingDepositId: string): Promise<void> {
    await this.prisma.pendingDeposit.update({
      where: { providerRef },
      data: { resultingDepositId, consumedAt: new Date() },
    });
  }
}
