export type MembershipRole = "ORGANIZER" | "MEMBER";

export interface Membership {
  id: string;
  poolId: string;
  userId: string;
  role: MembershipRole;
  joinedAt: Date;
  removedAt: Date | null;
}

export interface MembershipRepository {
  // Reactivates (clears removedAt on) an existing row for this poolId+userId
  // rather than erroring, so a removed Member can be re-invited later.
  create(poolId: string, userId: string, role: MembershipRole): Promise<Membership>;
  // Both find() and listByPool() treat a removed Membership as absent.
  find(poolId: string, userId: string): Promise<Membership | null>;
  listByPool(poolId: string): Promise<Membership[]>;
  remove(poolId: string, userId: string): Promise<void>;
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

export class MemberNotFoundError extends Error {
  constructor() {
    super("That person is not a Member of this Pool");
    this.name = "MemberNotFoundError";
  }
}

export class CannotRemoveOrganizerError extends Error {
  constructor() {
    super("The Organizer can't remove themselves from the Pool");
    this.name = "CannotRemoveOrganizerError";
  }
}
