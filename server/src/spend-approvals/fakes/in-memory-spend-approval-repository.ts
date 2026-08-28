import type { SpendApproval, SpendApprovalRepository } from "../types.js";

let nextId = 1;

export class InMemorySpendApprovalRepository implements SpendApprovalRepository {
  approvals: SpendApproval[] = [];

  async create(pendingSpendId: string, poolId: string, userId: string): Promise<SpendApproval> {
    const existing = await this.find(pendingSpendId, userId);
    if (existing) {
      return existing;
    }
    const approval: SpendApproval = {
      id: `spend_approval_${nextId++}`,
      pendingSpendId,
      poolId,
      userId,
      createdAt: new Date(),
    };
    this.approvals.push(approval);
    return approval;
  }

  async find(pendingSpendId: string, userId: string): Promise<SpendApproval | null> {
    return (
      this.approvals.find((a) => a.pendingSpendId === pendingSpendId && a.userId === userId) ?? null
    );
  }

  async listByPendingSpend(pendingSpendId: string): Promise<SpendApproval[]> {
    return this.approvals.filter((a) => a.pendingSpendId === pendingSpendId);
  }
}
