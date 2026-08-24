import { randomBytes, randomInt } from "node:crypto";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { UserRepository } from "../auth/types.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { InvitationRepository } from "../invitations/types.js";
import {
  InvalidOrganizerShareAmountError,
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MaxActivePoolsExceededError,
  MissingOrganizerShareAmountError,
  MissingPerPersonAmountError,
  NotPoolOrganizerError,
  OrganizerNotVerifiedError,
  UnexpectedOrganizerShareAmountError,
  UnexpectedPerPersonAmountError,
  type CreatePoolInput,
  type Pool,
  type PoolRepository,
  type PoolType,
} from "./types.js";

// Free-tier cap on concurrently Active Pools an Organizer may run (ticket
// #13, ADR 0011) — lifted entirely for a subscribed user.
const FREE_TIER_MAX_ACTIVE_POOLS = 3;

// How long the Organizer's self-addressed Invitation (ticket #58, extended
// to Equal Split by ADR-0017) stays payable, for both Pool types. Custom
// Split's real expiry-preset picker (ticket #62) governs Invitations sent to
// other people. Unpaid past this window, the Invitation lapses and the Pool
// moves to EXPIRED (lazy — see pool-expiry.ts, no background sweep).
const ORGANIZER_INVITATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface PoolServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  userRepository: UserRepository;
  notificationService: NotificationService;
  invitationRepository: InvitationRepository;
  generateJoinCode?: () => string;
  generateInvitationToken?: () => string;
}

export class PoolService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly userRepository: UserRepository;
  private readonly notificationService: NotificationService;
  private readonly invitationRepository: InvitationRepository;
  private readonly generateJoinCode: () => string;
  private readonly generateInvitationToken: () => string;

  constructor(options: PoolServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.userRepository = options.userRepository;
    this.notificationService = options.notificationService;
    this.invitationRepository = options.invitationRepository;
    this.generateJoinCode = options.generateJoinCode ?? defaultGenerateJoinCode;
    this.generateInvitationToken = options.generateInvitationToken ?? defaultGenerateInvitationToken;
  }

  async createPool(organizerId: string, input: CreatePoolInput): Promise<Pool> {
    const organizer = await this.userRepository.findById(organizerId);
    if (!organizer?.isVerified) {
      throw new OrganizerNotVerifiedError();
    }

    if (!organizer.isSubscribed) {
      const existingPools = await this.poolRepository.listByOrganizer(organizerId);
      const activeCount = existingPools.filter((p) => p.state === "ACTIVE").length;
      if (activeCount >= FREE_TIER_MAX_ACTIVE_POOLS) {
        throw new MaxActivePoolsExceededError();
      }
    }

    const name = input.name.trim();
    if (!name) {
      throw new InvalidPoolNameError();
    }

    let type: PoolType;
    let perPersonAmountPaise: number | null;

    if (input.type === "EQUAL_SPLIT") {
      if (input.organizerShareAmountPaise !== undefined) {
        throw new UnexpectedOrganizerShareAmountError();
      }
      if (input.perPersonAmountPaise === undefined) {
        throw new MissingPerPersonAmountError();
      }
      if (!Number.isInteger(input.perPersonAmountPaise) || input.perPersonAmountPaise <= 0) {
        throw new InvalidPerPersonAmountError();
      }
      type = "EQUAL_SPLIT";
      perPersonAmountPaise = input.perPersonAmountPaise;
    } else if (input.type === "CUSTOM_SPLIT") {
      if (input.perPersonAmountPaise !== undefined) {
        throw new UnexpectedPerPersonAmountError();
      }
      if (input.organizerShareAmountPaise === undefined) {
        throw new MissingOrganizerShareAmountError();
      }
      if (!Number.isInteger(input.organizerShareAmountPaise) || input.organizerShareAmountPaise <= 0) {
        throw new InvalidOrganizerShareAmountError();
      }
      type = "CUSTOM_SPLIT";
      perPersonAmountPaise = null;
    } else {
      if (input.perPersonAmountPaise !== undefined) {
        throw new UnexpectedPerPersonAmountError();
      }
      if (input.organizerShareAmountPaise !== undefined) {
        throw new UnexpectedOrganizerShareAmountError();
      }
      type = "OPEN";
      perPersonAmountPaise = null;
    }

    const pool = await this.poolRepository.create(organizerId, {
      name,
      type,
      perPersonAmountPaise,
      joinCode: this.generateJoinCode(),
    });

    if (type === "CUSTOM_SPLIT" || type === "EQUAL_SPLIT") {
      // Pool creation isn't done yet: the Organizer isn't a Member (and so
      // can't invite anyone) until they pay this Invitation themselves —
      // see DepositService.confirmDeposit (ADR 0016, extended to Equal
      // Split by ADR-0017).
      await this.invitationRepository.create({
        poolId: pool.id,
        inviteeUserId: organizerId,
        assignedAmountPaise:
          type === "CUSTOM_SPLIT"
            ? (input.organizerShareAmountPaise as number)
            : (perPersonAmountPaise as number),
        token: this.generateInvitationToken(),
        expiresAt: new Date(Date.now() + ORGANIZER_INVITATION_EXPIRY_MS),
      });
    } else {
      // OPEN — the Organizer is also a Member (CONTEXT.md) immediately;
      // OPEN was never brought into the payment-gate mechanism (ADR-0017
      // scopes it to Equal Split and Custom Split only).
      await this.membershipRepository.create(pool.id, organizerId, "ORGANIZER");
    }

    return pool;
  }

  async lockPool(poolId: string, userId: string): Promise<Pool> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== userId) {
      throw new NotPoolOrganizerError();
    }

    const locked = await this.poolRepository.updateState(poolId, "LOCKED");

    const members = await this.membershipRepository.listByPool(poolId);
    const otherMemberIds = members.map((member) => member.userId).filter((id) => id !== userId);
    if (otherMemberIds.length > 0) {
      await this.notificationService.notify({
        recipientUserIds: otherMemberIds,
        poolId,
        type: "POOL_LOCKED",
        message: `${pool.name} was locked`,
      });
    }

    // An unpaid Invitation is a deferred Deposit (CONTEXT.md) — only Custom
    // Split Pools send Invitations to invitees, so this is scoped there
    // rather than also catching, e.g., an Equal Split Pool's still-pending
    // Organizer self-Invitation (ticket #63).
    if (pool.type === "CUSTOM_SPLIT") {
      const voidedInvitations = await this.invitationRepository.voidPendingByPool(poolId);
      const voidedInviteeIds = voidedInvitations
        .map((invitation) => invitation.inviteeUserId)
        .filter((id) => id !== userId);
      if (voidedInviteeIds.length > 0) {
        await this.notificationService.notify({
          recipientUserIds: voidedInviteeIds,
          poolId,
          type: "INVITATION_VOIDED",
          message: `Your Invitation to ${pool.name} was voided because the Pool was locked`,
        });
      }
    }

    return locked;
  }

  async listPoolsForUser(userId: string): Promise<Pool[]> {
    // Includes Pools the caller organizes even before they've paid their own
    // share — creation "always succeeds immediately," and the Organizer
    // lands on that Pool's Dashboard right away (ADR-0017), which no longer
    // coincides with having a Membership for Equal Split/Custom Split.
    const [organized, memberships] = await Promise.all([
      this.poolRepository.listByOrganizer(userId),
      this.membershipRepository.listByUser(userId),
    ]);
    const memberPools = await Promise.all(
      memberships.map((membership) => this.poolRepository.findById(membership.poolId)),
    );

    const byId = new Map<string, Pool>();
    for (const pool of organized) {
      byId.set(pool.id, pool);
    }
    for (const pool of memberPools) {
      if (pool) {
        byId.set(pool.id, pool);
      }
    }
    return [...byId.values()];
  }
}

function defaultGenerateJoinCode(): string {
  return String(randomInt(100000, 1000000));
}

function defaultGenerateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}
