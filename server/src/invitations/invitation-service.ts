import { randomBytes } from "node:crypto";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { Pool, PoolRepository } from "../pools/types.js";
import { NotCustomSplitPoolError, NotPoolOrganizerError } from "../pools/types.js";
import type { UserRepository } from "../auth/types.js";
import type { NotificationService } from "../notifications/notification-service.js";
import { formatRupees } from "../lib/format-money.js";
import {
  InvalidInvitationAmountError,
  InvitationAlreadyPendingError,
  InviteeAlreadyMemberError,
  InviteeNotRegisteredError,
  isInvitationExpired,
  OrganizerNotAMemberError,
  type Invitation,
  type InvitationRepository,
} from "./types.js";

// Fixed default until ticket #62 adds the Organizer-facing expiry-preset
// picker — matches PoolService's ORGANIZER_INVITATION_EXPIRY_MS so every
// Invitation (self-addressed or sent to someone else) lapses on the same
// schedule until presets exist.
const DEFAULT_INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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
  ): Promise<Invitation> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== organizerId) {
      throw new NotPoolOrganizerError();
    }
    if (pool.type !== "CUSTOM_SPLIT") {
      throw new NotCustomSplitPoolError();
    }
    if (!Number.isInteger(assignedAmountPaise) || assignedAmountPaise <= 0) {
      throw new InvalidInvitationAmountError();
    }

    // The Organizer isn't a Member (hasn't paid their own share) until their
    // own self-addressed Invitation from Pool creation is paid — see
    // PoolService.createPool / DepositService.confirmDeposit (ADR 0016).
    const organizerMembership = await this.membershipRepository.find(poolId, organizerId);
    if (!organizerMembership) {
      throw new OrganizerNotAMemberError();
    }

    const invitee = await this.userRepository.findByPhoneNumber(phoneNumber);
    if (!invitee) {
      throw new InviteeNotRegisteredError();
    }

    const existingMembership = await this.membershipRepository.find(poolId, invitee.id);
    if (existingMembership) {
      throw new InviteeAlreadyMemberError();
    }

    const existingPending = await this.invitationRepository.findPendingByPoolAndInvitee(poolId, invitee.id);
    if (existingPending && !isInvitationExpired(existingPending, this.now())) {
      throw new InvitationAlreadyPendingError();
    }

    const invitation = await this.invitationRepository.create({
      poolId,
      inviteeUserId: invitee.id,
      assignedAmountPaise,
      token: this.generateInvitationToken(),
      expiresAt: new Date(this.now().getTime() + DEFAULT_INVITATION_EXPIRY_MS),
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

  // Every Invitation still worth opening for this invitee, across every
  // Pool — excludes ones that are lazily past expiresAt even though their
  // stored state is still PENDING (same lazy-expiry pattern as OtpRequest).
  async listMyInvitations(userId: string): Promise<InvitationForInvitee[]> {
    const pending = await this.invitationRepository.listPendingByInvitee(userId);
    const stillPayable = pending.filter((invitation) => !isInvitationExpired(invitation, this.now()));

    const results = await Promise.all(
      stillPayable.map(async (invitation) => {
        const pool = await this.poolRepository.findById(invitation.poolId);
        if (!pool) {
          return null;
        }
        const organizer = await this.userRepository.findById(pool.organizerId);
        return { invitation, pool, organizerName: organizer?.name ?? null };
      }),
    );

    return results.filter((result): result is InvitationForInvitee => result !== null);
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
}

function defaultGenerateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}
