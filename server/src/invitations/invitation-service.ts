import { randomBytes } from "node:crypto";
import type { Membership, MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { Pool, PoolRepository } from "../pools/types.js";
import { NotCustomSplitPoolError, NotPoolOrganizerError } from "../pools/types.js";
import type { User, UserRepository } from "../auth/types.js";
import type { NotificationService } from "../notifications/notification-service.js";
import { formatRupees } from "../lib/format-money.js";
import {
  InvalidInvitationAmountError,
  InvalidInvitationExpiryPresetError,
  InvitationAlreadyPendingError,
  InvitationNotAcceptableError,
  InvitationNotCancellableError,
  InvitationNotFoundForAccepterError,
  InvitationRecordNotFoundError,
  InvitationRequiresPaymentError,
  INVITATION_EXPIRY_PRESET_MS,
  InvitationLinkNotFoundError,
  InviteeAlreadyMemberError,
  InviteeNotRegisteredError,
  isInvitationExpired,
  NotEqualSplitPoolError,
  OrganizerNotAMemberError,
  type Invitation,
  type InvitationExpiryPreset,
  type InvitationRepository,
} from "./types.js";

const DEFAULT_INVITATION_EXPIRY_PRESET: InvitationExpiryPreset = "7d";

export interface InvitationServiceOptions {
  invitationRepository: InvitationRepository;
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  userRepository: UserRepository;
  notificationService: NotificationService;
  generateInvitationToken?: () => string;
  now?: () => Date;
}

// One Invitation enriched with the Pool it's for and the Organizer's name —
// what the invitee needs to render "Invited by X to Y for ₹Z" without a
// second round trip per row.
export interface InvitationForInvitee {
  invitation: Invitation;
  pool: Pool;
  organizerName: string | null;
}

// One Invitation enriched with the invitee's identity — the Organizer's
// management view of everyone they've sent an Invitation to for this Pool.
export interface SentInvitation {
  invitation: Invitation;
  inviteeName: string | null;
  inviteePhoneNumber: string;
}

export class InvitationService {
  private readonly invitationRepository: InvitationRepository;
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly userRepository: UserRepository;
  private readonly notificationService: NotificationService;
  private readonly generateInvitationToken: () => string;
  private readonly now: () => Date;

  constructor(options: InvitationServiceOptions) {
    this.invitationRepository = options.invitationRepository;
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.userRepository = options.userRepository;
    this.notificationService = options.notificationService;
    this.generateInvitationToken = options.generateInvitationToken ?? defaultGenerateInvitationToken;
    this.now = options.now ?? (() => new Date());
  }

  async sendInvitation(
    organizerId: string,
    poolId: string,
    phoneNumber: string,
    assignedAmountPaise: number,
    expiryPreset: InvitationExpiryPreset = DEFAULT_INVITATION_EXPIRY_PRESET,
  ): Promise<Invitation> {
    const pool = await this.findOrganizerPool(organizerId, poolId);
    if (pool.type !== "CUSTOM_SPLIT") {
      throw new NotCustomSplitPoolError();
    }
    if (!Number.isInteger(assignedAmountPaise) || assignedAmountPaise <= 0) {
      throw new InvalidInvitationAmountError();
    }
    const expiryMs = INVITATION_EXPIRY_PRESET_MS[expiryPreset];
    if (!expiryMs) {
      throw new InvalidInvitationExpiryPresetError();
    }

    const invitee = await this.resolveInvitee(pool, organizerId, phoneNumber);

    const invitation = await this.invitationRepository.create({
      poolId,
      inviteeUserId: invitee.id,
      assignedAmountPaise,
      token: this.generateInvitationToken(),
      expiresAt: new Date(this.now().getTime() + expiryMs),
    });

    const organizer = await this.userRepository.findById(organizerId);
    const organizerName = organizer?.name ?? "The Organizer";
    await this.notificationService.notify({
      recipientUserIds: [invitee.id],
      poolId,
      type: "INVITATION_RECEIVED",
      message: `${organizerName} invited you to ${pool.name} for ${formatRupees(assignedAmountPaise)}`,
    });

    return invitation;
  }

  // The Organizer directly picking a phone number/contact on an Equal Split
  // Pool (ticket #87) — reuses the Invitation entity/mechanism, but with no
  // assigned amount (Equal Split has no per-invitee share) and no
  // Organizer-approval step: choosing this specific person *is* the
  // approval. The invitee still must explicitly accept (acceptInvitation) —
  // this never creates a Membership by itself.
  async sendEqualSplitInvitation(
    organizerId: string,
    poolId: string,
    phoneNumber: string,
    expiryPreset: InvitationExpiryPreset = DEFAULT_INVITATION_EXPIRY_PRESET,
  ): Promise<Invitation> {
    const pool = await this.findOrganizerPool(organizerId, poolId);
    if (pool.type !== "EQUAL_SPLIT") {
      throw new NotEqualSplitPoolError();
    }
    const expiryMs = INVITATION_EXPIRY_PRESET_MS[expiryPreset];
    if (!expiryMs) {
      throw new InvalidInvitationExpiryPresetError();
    }

    const invitee = await this.resolveInvitee(pool, organizerId, phoneNumber);

    const invitation = await this.invitationRepository.create({
      poolId,
      inviteeUserId: invitee.id,
      assignedAmountPaise: null,
      token: this.generateInvitationToken(),
      expiresAt: new Date(this.now().getTime() + expiryMs),
    });

    const organizer = await this.userRepository.findById(organizerId);
    const organizerName = organizer?.name ?? "The Organizer";
    await this.notificationService.notify({
      recipientUserIds: [invitee.id],
      poolId,
      type: "INVITATION_RECEIVED",
      message: `${organizerName} added you to ${pool.name} — accept to join`,
    });

    return invitation;
  }

  // Shared by sendInvitation and sendEqualSplitInvitation: loads the Pool
  // and confirms the caller is its Organizer, before either method applies
  // its own pool-type/amount rules.
  private async findOrganizerPool(organizerId: string, poolId: string): Promise<Pool> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== organizerId) {
      throw new NotPoolOrganizerError();
    }
    return pool;
  }

  // Shared by sendInvitation and sendEqualSplitInvitation, once each has
  // validated its own pool-type/amount rules: the Organizer-paid-their-own-
  // share gate (ADR 0016/0017), invitee lookup, and the existing-Membership/
  // still-pending checks are identical either way.
  private async resolveInvitee(pool: Pool, organizerId: string, phoneNumber: string): Promise<User> {
    const organizerMembership = await this.membershipRepository.find(pool.id, organizerId);
    if (!organizerMembership) {
      throw new OrganizerNotAMemberError();
    }

    const invitee = await this.userRepository.findByPhoneNumber(phoneNumber);
    if (!invitee) {
      throw new InviteeNotRegisteredError();
    }

    const existingMembership = await this.membershipRepository.find(pool.id, invitee.id);
    if (existingMembership) {
      throw new InviteeAlreadyMemberError();
    }

    const existingPending = await this.invitationRepository.findPendingByPoolAndInvitee(pool.id, invitee.id);
    if (existingPending && !isInvitationExpired(existingPending, this.now())) {
      throw new InvitationAlreadyPendingError();
    }

    return invitee;
  }

  // The invitee explicitly accepting an Equal Split phone/contact Invitation
  // (ticket #87) — the only way that entity ever becomes a Membership, since
  // this path never runs through DepositService (no payment, no Deposit).
  // Custom Split's assigned-amount Invitation is deliberately rejected here;
  // it can only be resolved by paying (see DepositService.confirmDeposit).
  async acceptInvitation(invitationId: string, requesterId: string): Promise<Membership> {
    const invitation = await this.invitationRepository.findById(invitationId);
    if (!invitation || invitation.inviteeUserId !== requesterId) {
      throw new InvitationNotFoundForAccepterError();
    }
    if (invitation.assignedAmountPaise !== null) {
      throw new InvitationRequiresPaymentError();
    }
    if (invitation.state !== "PENDING" || isInvitationExpired(invitation, this.now())) {
      throw new InvitationNotAcceptableError();
    }

    await this.invitationRepository.markPaid(invitation.id);
    return this.membershipRepository.create(invitation.poolId, requesterId, "MEMBER");
  }

  // Every Invitation still worth opening for this invitee, across every
  // Pool — excludes ones that are lazily past expiresAt even though their
  // stored state is still PENDING (same lazy-expiry pattern as OtpRequest).
  async listMyInvitations(userId: string): Promise<InvitationForInvitee[]> {
    const pending = await this.invitationRepository.listPendingByInvitee(userId);
    const stillPayable = pending.filter((invitation) => !isInvitationExpired(invitation, this.now()));

    const results = await Promise.all(stillPayable.map((invitation) => this.enrichForInvitee(invitation)));
    return results.filter((result): result is InvitationForInvitee => result !== null);
  }

  // Resolves the Organizer's shareable Invitation link (ticket #61). Bound
  // to the one invitee it names: an unknown token and a token that exists
  // but names someone else both throw the same InvitationLinkNotFoundError,
  // so the response can never confirm an Invitation exists for anyone but
  // its rightful invitee, let alone leak its assigned amount or Pool.
  async getInvitationByToken(token: string, requesterId: string): Promise<InvitationForInvitee> {
    const invitation = await this.invitationRepository.findByToken(token);
    if (!invitation || invitation.inviteeUserId !== requesterId) {
      throw new InvitationLinkNotFoundError();
    }

    const enriched = await this.enrichForInvitee(invitation);
    if (!enriched) {
      throw new InvitationLinkNotFoundError();
    }
    return enriched;
  }

  private async enrichForInvitee(invitation: Invitation): Promise<InvitationForInvitee | null> {
    const pool = await this.poolRepository.findById(invitation.poolId);
    if (!pool) {
      return null;
    }
    const organizer = await this.userRepository.findById(pool.organizerId);
    return { invitation, pool, organizerName: organizer?.name ?? null };
  }

  // Every Invitation ever sent for one Pool — the Organizer's management
  // view, spanning pending/paid/cancelled/voided.
  async listSentInvitations(poolId: string, requesterId: string): Promise<SentInvitation[]> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== requesterId) {
      throw new NotPoolOrganizerError();
    }

    const invitations = await this.invitationRepository.listByPool(poolId);
    const results = await Promise.all(
      invitations.map(async (invitation) => {
        const invitee = await this.userRepository.findById(invitation.inviteeUserId);
        return {
          invitation,
          inviteeName: invitee?.name ?? null,
          inviteePhoneNumber: invitee?.phoneNumber ?? "",
        };
      }),
    );
    return results;
  }

  // Organizer withdraws a pending, unpaid Invitation. No edit path exists
  // (ADR 0016) — cancel-and-resend is the only way to change an amount.
  async cancelInvitation(organizerId: string, poolId: string, invitationId: string): Promise<Invitation> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== organizerId) {
      throw new NotPoolOrganizerError();
    }

    const invitation = await this.invitationRepository.findById(invitationId);
    if (!invitation || invitation.poolId !== poolId) {
      throw new InvitationRecordNotFoundError();
    }
    if (invitation.state !== "PENDING") {
      throw new InvitationNotCancellableError();
    }

    return this.invitationRepository.markCancelled(invitation.id);
  }
}

function defaultGenerateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}
