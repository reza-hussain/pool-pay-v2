export type PoolType = "EQUAL_SPLIT" | "OPEN" | "CUSTOM_SPLIT";
// EXPIRED (ADR-0017): the Organizer's self-Invitation lapsed unpaid at
// ORGANIZER_INVITATION_EXPIRY_MS. Terminal, like CLOSED, but reached without
// ever collecting money — no refund logic applies.
export type PoolState = "ACTIVE" | "LOCKED" | "CLOSED" | "EXPIRED";

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
  // Null by default (no expiry). Governs whether a join attempt via the
  // code/link is accepted at all (ticket #88) — distinct from a JoinRequest's
  // own lifetime, which has no expiry of its own (ticket #86).
  joinCodeExpiresAt: Date | null;
}

// Same three-preset shape as Custom Split's Invitation expiry
// (InvitationExpiryPreset) — kept as its own type since a join code's
// expiry is a different concept, even though the durations happen to match.
export type PoolJoinCodeExpiryPreset = "24h" | "3d" | "7d";

export const POOL_JOIN_CODE_EXPIRY_PRESET_MS: Record<PoolJoinCodeExpiryPreset, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface CreatePoolInput {
  name: string;
  type: PoolType;
  perPersonAmountPaise?: number;
  // CUSTOM_SPLIT only — the Organizer's own assigned share, paid via a
  // self-addressed Invitation before Pool creation finishes (ticket #58).
  // Distinct from perPersonAmountPaise, which never applies to CUSTOM_SPLIT.
  organizerShareAmountPaise?: number;
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
  updateJoinCodeExpiry(id: string, expiresAt: Date): Promise<Pool>;
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

export class MissingOrganizerShareAmountError extends Error {
  constructor() {
    super("Custom Split Pools require the Organizer's own assigned share amount");
    this.name = "MissingOrganizerShareAmountError";
  }
}

export class InvalidOrganizerShareAmountError extends Error {
  constructor() {
    super("Organizer share amount must be a positive whole number of paise");
    this.name = "InvalidOrganizerShareAmountError";
  }
}

export class UnexpectedOrganizerShareAmountError extends Error {
  constructor() {
    super("Only Custom Split Pools take an Organizer share amount");
    this.name = "UnexpectedOrganizerShareAmountError";
  }
}

export class NotPoolOrganizerError extends Error {
  constructor() {
    super("Only the Organizer can perform this action");
    this.name = "NotPoolOrganizerError";
  }
}

// Sending an Invitation (ticket #60) only makes sense for a Custom Split
// Pool — Equal Split joins via Invite Link/Pool Code instead.
export class NotCustomSplitPoolError extends Error {
  constructor() {
    super("Only Custom Split Pools can send Invitations");
    this.name = "NotCustomSplitPoolError";
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

export class InvalidJoinCodeExpiryPresetError extends Error {
  constructor() {
    super("expiryPreset must be one of 24h, 3d, 7d");
    this.name = "InvalidJoinCodeExpiryPresetError";
  }
}
