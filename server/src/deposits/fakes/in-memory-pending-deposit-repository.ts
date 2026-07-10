import type { PendingDeposit, PendingDepositRepository } from "../types.js";

let nextId = 1;

export class InMemoryPendingDepositRepository implements PendingDepositRepository {
  pendingDeposits: PendingDeposit[] = [];

  async create(providerRef: string, poolId: string, userId: string): Promise<PendingDeposit> {
    const pending: PendingDeposit = {
      id: `pending_deposit_${nextId++}`,
      providerRef,
      poolId,
      userId,
      resultingDepositId: null,
      consumedAt: null,
      createdAt: new Date(),
    };
    this.pendingDeposits.push(pending);
    return pending;
  }

  async findByProviderRef(providerRef: string): Promise<PendingDeposit | null> {
    return this.pendingDeposits.find((p) => p.providerRef === providerRef) ?? null;
  }

  async markConsumed(providerRef: string, resultingDepositId: string): Promise<void> {
    const pending = this.pendingDeposits.find((p) => p.providerRef === providerRef);
    if (!pending) {
      return;
    }
    pending.resultingDepositId = resultingDepositId;
    pending.consumedAt = new Date();
  }
}
