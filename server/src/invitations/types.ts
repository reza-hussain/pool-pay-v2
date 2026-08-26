export type InvitationState = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";

// Small fixed set the Organizer picks from when sending an Invitation
// (ticket #62) — exact values are implementation's choice per the issue.
export type InvitationExpiryPreset = "24h" | "3d" | "7d";

export const INVITATION_EXPIRY_PRESET_MS: Record<InvitationExpiryPreset, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface Invitation {
  id: string;
  poolId: string;
  inviteeUserId: string;
  // In paise. Individually assigned by the Organizer — not shared with any
  // other Invitation on the same Pool. Null for the Equal Split phone/contact
  // variant (ticket #87), which has no per-invitee assigned share — the
  // invitee accepts at zero cost instead of paying this amount.
  assignedAmountPaise: number | null;
  state: InvitationState;
  // Opaque token for the phone-bound Invitation link (ticket #61) — unused
  // by the self-addressed Invitation created at Pool creation (ticket #58).
  token: string;
  expiresAt: Date;
  createdAt: Date;
  paidAt: Date | null;
}

// Lazy expiry, same pattern as OtpRequest — no state mutation, no cron; every
// caller compares against `now` at read time instead.
export function isInvitationExpired(invitation: Invitation, now: Date): boolean {
  return invitation.expiresAt.getTime() <= now.getTime();
}

export interface CreateInvitationData {
  poolId: string;
  inviteeUserId: string;
  assignedAmountPaise: number | null;
  token: string;
  expiresAt: Date;
}

export interface InvitationRepository {
  create(data: CreateInvitationData): Promise<Invitation>;
  // Only ever matches a PENDING Invitation — a paid, cancelled, or expired
  // one is not a thing left to pay against.
  findPendingByPoolAndInvitee(poolId: string, inviteeUserId: string): Promise<Invitation | null>;
  // Any Invitation regardless of state — backs cancellation, which needs to
  // load the row first to check its current state (ticket #62).
  findById(id: string): Promise<Invitation | null>;
  markPaid(id: string): Promise<Invitation>;
  // Lazy expiry only (ADR-0017) — called at the point something touches a
  // Pool whose Organizer self-Invitation has lapsed, never by a sweep.
  markExpired(id: string): Promise<Invitation>;
  // Organizer withdraws a pending, unpaid Invitation (ticket #62). Guarded on
  // state at the write itself (not just the caller's pre-check) so a payment
  // confirming concurrently can't be clobbered back to CANCELLED — throws
  // InvitationNotCancellableError if the state has already moved on.
  markCancelled(id: string): Promise<Invitation>;
  // PENDING Invitations across every Pool for one invitee (ticket #60) — the
  // invitee's own list of Invitations still worth opening. Stays PENDING
  // even past expiresAt (lazy expiry, same as OtpRequest — no state
  // mutation, no cron); callers filter out past-expiry rows themselves.
  listPendingByInvitee(userId: string): Promise<Invitation[]>;
  // Every Invitation ever sent for one Pool, newest first — the Organizer's
  // management view (ticket #60), spanning every state.
  listByPool(poolId: string): Promise<Invitation[]>;
  // Backs the phone-bound Invitation link (ticket #61) — token is unique, so
  // this is a single lookup regardless of state; the caller enforces that
  // only the invitee it names may see the result.
  findByToken(token: string): Promise<Invitation | null>;
}

// Thrown when a Custom Split Pool deposit is attempted with no PENDING
// Invitation to back it — never sent one, already paid, cancelled, or
// expired all look the same from here: there's nothing left to pay.
export class InvitationNotFoundError extends Error {
  constructor() {
    super("No pending Invitation found for this Pool");
    this.name = "InvitationNotFoundError";
  }
}

// Custom Split payment is exact-match only (ADR 0016) — a shortfall or
// overage is rejected outright, never recorded.
export class InvitationAmountMismatchError extends Error {
  constructor() {
    super("Payment does not match the Invitation's assigned amount");
    this.name = "InvitationAmountMismatchError";
  }
}

// Sending an Invitation to a phone number with no matching User (ticket
// #60) — Invitations only resolve against an existing registered account,
// no SMS-to-signup flow.
export class InviteeNotRegisteredError extends Error {
  constructor() {
    super("That phone number isn't a registered Pool Pay user");
    this.name = "InviteeNotRegisteredError";
  }
}

// The Organizer can't invite anyone else until they've paid their own share
// (ADR 0016) — keeps "Organizer" and "paid Member" the same invariant for
// everyone, themselves included.
export class OrganizerNotAMemberError extends Error {
  constructor() {
    super("Pay your own share before inviting others");
    this.name = "OrganizerNotAMemberError";
  }
}

export class InvalidInvitationAmountError extends Error {
  constructor() {
    super("Assigned amount must be a positive whole number of paise");
    this.name = "InvalidInvitationAmountError";
  }
}

export class InvalidInvitationExpiryPresetError extends Error {
  constructor() {
    super("expiryPreset must be one of 24h, 3d, 7d");
    this.name = "InvalidInvitationExpiryPresetError";
  }
}

// The invitee is already a Member of this Pool — nothing left to invite them
// into.
export class InviteeAlreadyMemberError extends Error {
  constructor() {
    super("That person is already a Member of this Pool");
    this.name = "InviteeAlreadyMemberError";
  }
}

// One still-payable (PENDING, unexpired) Invitation per (Pool, invitee) at a
// time — editing isn't supported (ADR 0016), so a second send while one is
// still outstanding would just create ambiguity over which amount applies.
export class InvitationAlreadyPendingError extends Error {
  constructor() {
    super("This person already has a pending Invitation to this Pool");
    this.name = "InvitationAlreadyPendingError";
  }
}

// Cancelling an id that doesn't map to any Invitation on this Pool —
// distinct from InvitationNotFoundError, which is about the deposit path
// having no PENDING Invitation to pay against (ticket #62).
export class InvitationRecordNotFoundError extends Error {
  constructor() {
    super("No Invitation found with that id for this Pool");
    this.name = "InvitationRecordNotFoundError";
  }
}

// Only a PENDING Invitation can be cancelled — a paid one is a done deal, a
// cancelled or expired one is already resolved (ticket #62). Editing isn't
// supported either (ADR 0016), so cancel-and-resend is the only path back
// to a fresh Invitation.
export class InvitationNotCancellableError extends Error {
  constructor() {
    super("Only a pending Invitation can be cancelled");
    this.name = "InvitationNotCancellableError";
  }
}

// Thrown for both an unknown token and a token that exists but names a
// different invitee (ticket #61) — deliberately the same error either way,
// so a mismatched-account attempt can't distinguish "no such Invitation"
// from "not your Invitation," and the response carries no Pool/amount data.
export class InvitationLinkNotFoundError extends Error {
  constructor() {
    super("This Invitation link isn't valid for your account");
    this.name = "InvitationLinkNotFoundError";
  }
}

// The Organizer's direct phone/contact add (ticket #87) only makes sense for
// an Equal Split Pool — Custom Split already has its own targeted,
// assigned-amount Invitation, and Open Pools don't take Invitations at all.
export class NotEqualSplitPoolError extends Error {
  constructor() {
    super("Only Equal Split Pools support adding a Member directly by phone or contact");
    this.name = "NotEqualSplitPoolError";
  }
}

// Thrown for both an unknown Invitation id and one that exists but names a
// different invitee (ticket #87) — same non-leaking pattern as
// InvitationLinkNotFoundError, so a mismatched-account attempt can't tell
// "no such Invitation" from "not yours."
export class InvitationNotFoundForAccepterError extends Error {
  constructor() {
    super("No Invitation found for your account with that id");
    this.name = "InvitationNotFoundForAccepterError";
  }
}

// Only a PENDING, unexpired Invitation can be accepted (ticket #87) — an
// already-resolved (paid/cancelled) or lazily-expired one has nothing left
// to accept.
export class InvitationNotAcceptableError extends Error {
  constructor() {
    super("This Invitation can no longer be accepted");
    this.name = "InvitationNotAcceptableError";
  }
}

// A Custom Split Invitation carries an assigned amount that must be paid in
// full (ADR 0016) — it can't be resolved by the zero-cost accept path built
// for the Equal Split phone/contact variant (ticket #87).
export class InvitationRequiresPaymentError extends Error {
  constructor() {
    super("This Invitation has an assigned amount and must be paid, not just accepted");
    this.name = "InvitationRequiresPaymentError";
  }
}
