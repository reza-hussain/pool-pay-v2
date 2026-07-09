export type MembershipRole = "ORGANIZER" | "MEMBER";

export interface Membership {
  id: string;
  poolId: string;
  userId: string;
  role: MembershipRole;
  joinedAt: Date;
}

export interface MembershipRepository {
  create(poolId: string, userId: string, role: MembershipRole): Promise<Membership>;
  find(poolId: string, userId: string): Promise<Membership | null>;
  listByPool(poolId: string): Promise<Membership[]>;
}

export class PoolNotFoundError extends Error {
  constructor() {
    super("Pool not found");
    this.name = "PoolNotFoundError";
  }
}

export class InvalidJoinCodeError extends Error {
  constructor() {
    super("Invalid Pool code");
    this.name = "InvalidJoinCodeError";
  }
}

export class PoolClosedError extends Error {
  constructor() {
    super("This Pool is closed");
    this.name = "PoolClosedError";
  }
}
