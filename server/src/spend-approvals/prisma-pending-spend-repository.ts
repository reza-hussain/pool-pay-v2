import type { PrismaClient } from "@prisma/client";
import type { PendingSpend, PendingSpendRepository } from "./types.js";

export class PrismaPendingSpendRepository implements PendingSpendRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    poolId: string,
    recorderId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<PendingSpend> {
    return this.toPendingSpend(
      await this.prisma.pendingSpend.create({
        data: { poolId, recorderId, merchantRef, amountPaise, feePaise },
      }),
    );
  }

  async findById(id: string): Promise<PendingSpend | null> {
    const pendingSpend = await this.prisma.pendingSpend.findUnique({ where: { id } });
    return pendingSpend ? this.toPendingSpend(pendingSpend) : null;
  }

  async listPendingByPool(poolId: string): Promise<PendingSpend[]> {
    const pendingSpends = await this.prisma.pendingSpend.findMany({
      where: { poolId, state: "PENDING" },
    });
    return pendingSpends.map((p) => this.toPendingSpend(p));
  }

  async markExecuted(id: string, resultingSpendId: string): Promise<PendingSpend> {
    return this.toPendingSpend(
      await this.prisma.pendingSpend.update({
        where: { id },
        data: { state: "EXECUTED", resultingSpendId },
      }),
    );
  }

  private toPendingSpend(row: {
    id: string;
    poolId: string;
    recorderId: string;
    merchantRef: string;
    amountPaise: number;
    feePaise: number;
    state: string;
    resultingSpendId: string | null;
    createdAt: Date;
  }): PendingSpend {
    return { ...row, state: row.state as PendingSpend["state"] };
  }
}
