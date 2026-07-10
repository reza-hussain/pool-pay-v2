export type PoolType = "EQUAL_SPLIT" | "OPEN";
export type PoolState = "ACTIVE" | "LOCKED" | "CLOSED";

export interface Pool {
  id: string;
  name: string;
  type: PoolType;
  // In paise (1 INR = 100 paise). Required for EQUAL_SPLIT, always null for OPEN.
  perPersonAmountPaise: number | null;
  state: PoolState;
  organizerId: string;
  createdAt: Date;
  // Six-digit code for manual Pool joining. An Invite Link is just this Pool's
  // id embedded in a deep link — no separate field needed for that.
  joinCode: string;
}

export interface CreatePoolInput {
  name: string;
  type: PoolType;
  perPersonAmountPaise?: number;
}

// The validated shape PoolService hands to a repository — always resolved to
// either a positive integer or null, never the input's optional-and-unvalidated form.
export interface CreatePoolData {
  name: string;
  type: PoolType;
  perPersonAmountPaise: number | null;
  joinCode: string;
}

export interface PoolRepository {
  create(organizerId: string, data: CreatePoolData): Promise<Pool>;
  findById(id: string): Promise<Pool | null>;
  findByJoinCode(joinCode: string): Promise<Pool | null>;
  updateState(id: string, state: PoolState): Promise<Pool>;
  listByOrganizer(organizerId: string): Promise<Pool[]>;
}

export class InvalidPoolNameError extends Error {
  constructor() {
    super("Pool name is required");
    this.name = "InvalidPoolNameError";
  }
}

export class MissingPerPersonAmountError extends Error {
  constructor() {
    super("Equal Split Pools require a per-person amount");
    this.name = "MissingPerPersonAmountError";
  }
}

export class UnexpectedPerPersonAmountError extends Error {
  constructor() {
    super("Open Pools must not have a per-person amount");
    this.name = "UnexpectedPerPersonAmountError";
  }
}

export class InvalidPerPersonAmountError extends Error {
  constructor() {
    super("Per-person amount must be a positive whole number of paise");
    this.name = "InvalidPerPersonAmountError";
  }
}

export class NotPoolOrganizerError extends Error {
  constructor() {
    super("Only the Organizer can perform this action");
    this.name = "NotPoolOrganizerError";
  }
}

export class OrganizerNotVerifiedError extends Error {
  constructor() {
    super("Verify your identity before creating a Pool");
    this.name = "OrganizerNotVerifiedError";
  }
}

export class MaxActivePoolsExceededError extends Error {
  constructor() {
    super("Free accounts are limited to 3 concurrently Active Pools — subscribe for unlimited Pools");
    this.name = "MaxActivePoolsExceededError";
  }
}
