import type { PendingSpend, PendingSpendRepository } from "../types.js";

let nextId = 1;

export class InMemoryPendingSpendRepository implements PendingSpendRepository {
  pendingSpends: PendingSpend[] = [];

  async create(
    poolId: string,
    recorderId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<PendingSpend> {
    const pendingSpend: PendingSpend = {
      id: `pending_spend_${nextId++}`,
      poolId,
      recorderId,
      merchantRef,
      amountPaise,
      feePaise,
      state: "PENDING",
      resultingSpendId: null,
      createdAt: new Date(),
    };
    this.pendingSpends.push(pendingSpend);
    return pendingSpend;
  }

  async findById(id: string): Promise<PendingSpend | null> {
    return this.pendingSpends.find((p) => p.id === id) ?? null;
  }

  async listPendingByPool(poolId: string): Promise<PendingSpend[]> {
    return this.pendingSpends.filter((p) => p.poolId === poolId && p.state === "PENDING");
  }

  async markExecuted(id: string, resultingSpendId: string): Promise<PendingSpend> {
    const pendingSpend = this.pendingSpends.find((p) => p.id === id);
    if (!pendingSpend) {
      throw new Error(`PendingSpend ${id} not found`);
    }
    pendingSpend.state = "EXECUTED";
    pendingSpend.resultingSpendId = resultingSpendId;
    return pendingSpend;
  }
}
