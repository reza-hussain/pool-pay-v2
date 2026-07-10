import type { Deposit, DepositRepository } from "../types.js";

let nextId = 1;

export class InMemoryDepositRepository implements DepositRepository {
  deposits: Deposit[] = [];

  async create(poolId: string, userId: string, amountPaise: number): Promise<Deposit> {
    const deposit: Deposit = {
      id: `deposit_${nextId++}`,
      poolId,
      userId,
      amountPaise,
      createdAt: new Date(),
    };
    this.deposits.push(deposit);
    return deposit;
  }

  async findById(id: string): Promise<Deposit | null> {
    return this.deposits.find((d) => d.id === id) ?? null;
  }

  async sumByPool(poolId: string): Promise<number> {
    return this.deposits
      .filter((d) => d.poolId === poolId)
      .reduce((sum, d) => sum + d.amountPaise, 0);
  }

  async sumByPoolAndUser(poolId: string, userId: string): Promise<number> {
    return this.deposits
      .filter((d) => d.poolId === poolId && d.userId === userId)
      .reduce((sum, d) => sum + d.amountPaise, 0);
  }

  async listByPool(poolId: string): Promise<Deposit[]> {
    return this.deposits.filter((d) => d.poolId === poolId);
  }
}
