import type { PrismaClient } from "@prisma/client";
import type { SpendApproval, SpendApprovalRepository } from "./types.js";

export class PrismaSpendApprovalRepository implements SpendApprovalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(pendingSpendId: string, poolId: string, userId: string): Promise<SpendApproval> {
    return this.prisma.spendApproval.upsert({
      where: { pendingSpendId_userId: { pendingSpendId, userId } },
      update: {},
      create: { pendingSpendId, poolId, userId },
    });
  }

  async find(pendingSpendId: string, userId: string): Promise<SpendApproval | null> {
    return this.prisma.spendApproval.findUnique({
      where: { pendingSpendId_userId: { pendingSpendId, userId } },
    });
  }

  async listByPendingSpend(pendingSpendId: string): Promise<SpendApproval[]> {
    return this.prisma.spendApproval.findMany({ where: { pendingSpendId } });
  }
}
