export interface Refund {
  id: string;
  poolId: string;
  memberId: string;
  vpa: string;
  amountPaise: number;
  createdAt: Date;
}

export interface RefundRepository {
  create(poolId: string, memberId: string, vpa: string, amountPaise: number): Promise<Refund>;
  sumByPool(poolId: string): Promise<number>;
  listByPool(poolId: string): Promise<Refund[]>;
}

export class PoolAlreadyClosedError extends Error {
  constructor() {
    super("This Pool is already closed");
    this.name = "PoolAlreadyClosedError";
  }
}
