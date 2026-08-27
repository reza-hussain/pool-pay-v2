import type { JoinRequest } from "../join-requests/types.js";

export type MembershipRole = "ORGANIZER" | "MEMBER";

export interface Membership {
  id: string;
  poolId: string;
  userId: string;
  role: MembershipRole;
  joinedAt: Date;
  removedAt: Date | null;
}

// What joining via Pool Code/Invite Link resolves to (ticket #86): an
// immediate Membership for every Pool type except Equal Split, which now
// creates a JoinRequest awaiting the Organizer's approval instead.
export type JoinResult =
  | { kind: "MEMBERSHIP"; membership: Membership }
  | { kind: "JOIN_REQUEST"; joinRequest: JoinRequest };

export interface MembershipRepository {
  // Reactivates (clears removedAt on) an existing row for this poolId+userId
  // rather than erroring, so a removed Member can be re-invited later.
  create(poolId: string, userId: string, role: MembershipRole): Promise<Membership>;
  // find(), listByPool(), and listByUser() all treat a removed Membership as absent.
  find(poolId: string, userId: string): Promise<Membership | null>;
  listByPool(poolId: string): Promise<Membership[]>;
  listByUser(userId: string): Promise<Membership[]>;
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

// The Organizer set an expiry on the Pool's join code/link (ticket #88) and
// it has since passed — applies uniformly whether the code was typed,
// scanned, or clicked, since there's one join code and one expiry. Distinct
// from a JoinRequest's own lifetime, which has no expiry of its own.
export class JoinCodeExpiredError extends Error {
  constructor() {
    super("This Pool's join code/link has expired");
    this.name = "JoinCodeExpiredError";
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
