import type { PrismaClient } from "@prisma/client";
import type { RefundVote, RefundVoteRepository } from "./types.js";

export class PrismaRefundVoteRepository implements RefundVoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(poolId: string, userId: string): Promise<RefundVote> {
    return this.prisma.refundVote.upsert({
      where: { poolId_userId: { poolId, userId } },
      update: {},
      create: { poolId, userId },
    });
  }

  async find(poolId: string, userId: string): Promise<RefundVote | null> {
    return this.prisma.refundVote.findUnique({ where: { poolId_userId: { poolId, userId } } });
  }

  async listByPool(poolId: string): Promise<RefundVote[]> {
    return this.prisma.refundVote.findMany({ where: { poolId } });
  }
}
