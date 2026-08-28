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
  // find(), listByPool(), and listByUser() all treat a removed Membership as absent.
  find(poolId: string, userId: string): Promise<Membership | null>;
  listByPool(poolId: string): Promise<Membership[]>;
  listByUser(userId: string): Promise<Membership[]>;
  remove(poolId: string, userId: string): Promise<void>;
  // Organizer Transfer (ADR-0023) flips both the outgoing and incoming
  // Organizer's role in two calls to this — no combined "swap" method, since
  // each side is an independent row update.
  updateRole(poolId: string, userId: string, role: MembershipRole): Promise<Membership>;
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

// Organizer Transfer (ADR-0023) target validation.
export class TargetAlreadyOrganizerError extends Error {
  constructor() {
    super("This Member is already the Organizer");
    this.name = "TargetAlreadyOrganizerError";
  }
}

// The Dashboard's "Awaiting Payment" gate (ADR-0016, ADR-0017): the
// Organizer hasn't paid their own share yet, so nobody — including someone
// scanning the join code or invite link — can join this Pool. Also thrown
// for a Pool that's since lapsed to EXPIRED, since that Organizer will never
// have a Membership either.
export class PoolAwaitingPaymentError extends Error {
  constructor() {
    super("This Pool isn't accepting Members until the Organizer pays their own share");
    this.name = "PoolAwaitingPaymentError";
  }
}
