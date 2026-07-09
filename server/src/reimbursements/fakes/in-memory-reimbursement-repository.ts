import type { Reimbursement, ReimbursementRepository } from "../types.js";

let nextId = 1;

export class InMemoryReimbursementRepository implements ReimbursementRepository {
  reimbursements: Reimbursement[] = [];

  async create(
    poolId: string,
    memberId: string,
    vpa: string,
    amountPaise: number,
  ): Promise<Reimbursement> {
    const reimbursement: Reimbursement = {
      id: `reimbursement_${nextId++}`,
      poolId,
      memberId,
      vpa,
      amountPaise,
      createdAt: new Date(),
    };
    this.reimbursements.push(reimbursement);
    return reimbursement;
  }

  async sumByPool(poolId: string): Promise<number> {
    return this.reimbursements
      .filter((r) => r.poolId === poolId)
      .reduce((sum, r) => sum + r.amountPaise, 0);
  }

  async listByPool(poolId: string): Promise<Reimbursement[]> {
    return this.reimbursements.filter((r) => r.poolId === poolId);
  }
}
