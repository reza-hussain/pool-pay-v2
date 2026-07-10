import type { Refund, RefundRepository } from "../types.js";

let nextId = 1;

export class InMemoryRefundRepository implements RefundRepository {
  refunds: Refund[] = [];

  async create(poolId: string, memberId: string, vpa: string, amountPaise: number): Promise<Refund> {
    const refund: Refund = {
      id: `refund_${nextId++}`,
      poolId,
      memberId,
      vpa,
      amountPaise,
      createdAt: new Date(),
    };
    this.refunds.push(refund);
    return refund;
  }

  async sumByPool(poolId: string): Promise<number> {
    return this.refunds
      .filter((r) => r.poolId === poolId)
      .reduce((sum, r) => sum + r.amountPaise, 0);
  }

  async listByPool(poolId: string): Promise<Refund[]> {
    return this.refunds.filter((r) => r.poolId === poolId);
  }
}
