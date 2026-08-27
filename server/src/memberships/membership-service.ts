import { NotPoolOrganizerError, type Pool, type PoolRepository } from "../pools/types.js";
import { expireIfLapsed } from "../pools/pool-expiry.js";
import type { InvitationRepository } from "../invitations/types.js";
import type { JoinRequestService } from "../join-requests/join-request-service.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolAwaitingPaymentError,
  PoolClosedError,
  PoolNotFoundError,
  type JoinResult,
  type Membership,
  type MembershipRepository,
} from "./types.js";

export interface MembershipServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  invitationRepository: InvitationRepository;
  joinRequestService: JoinRequestService;
}

export class MembershipService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly invitationRepository: InvitationRepository;
  private readonly joinRequestService: JoinRequestService;

  constructor(options: MembershipServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.invitationRepository = options.invitationRepository;
    this.joinRequestService = options.joinRequestService;
  }

  async joinByPoolId(userId: string, poolId: string): Promise<JoinResult> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    return this.join(userId, pool);
  }

  async joinByCode(userId: string, joinCode: string): Promise<JoinResult> {
    const pool = await this.poolRepository.findByJoinCode(joinCode);
    if (!pool) {
      throw new InvalidJoinCodeError();
    }
    return this.join(userId, pool);
  }

  async listMembers(poolId: string): Promise<Membership[]> {
    return this.membershipRepository.listByPool(poolId);
  }

  async removeMember(poolId: string, organizerUserId: string, memberId: string): Promise<void> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== organizerUserId) {
      throw new NotPoolOrganizerError();
    }
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }
    if (memberId === organizerUserId) {
      throw new CannotRemoveOrganizerError();
    }

    const membership = await this.membershipRepository.find(poolId, memberId);
    if (!membership) {
      throw new MemberNotFoundError();
    }

    await this.membershipRepository.remove(poolId, memberId);
  }

  private async join(userId: string, pool: Pool): Promise<JoinResult> {
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }
    // Locked only stops deposits (see CONTEXT.md / ADR 0006) — joining a
    // Locked Pool is still allowed, only Closed is end-of-life.

    const existing = await this.membershipRepository.find(pool.id, userId);
    if (existing) {
      return { kind: "MEMBERSHIP", membership: existing };
    }

    pool = await expireIfLapsed(
      {
        poolRepository: this.poolRepository,
        invitationRepository: this.invitationRepository,
        membershipRepository: this.membershipRepository,
      },
      pool,
    );
    // "Does the Organizer have a Membership yet" is the single source of
    // truth for whether the Dashboard — and joining — is unlocked (ADR-0016,
    // ADR-0017). Covers both an unpaid-but-still-pending Pool and one that's
    // since lapsed to EXPIRED, since neither Organizer has a Membership.
    const organizerMembership = await this.membershipRepository.find(pool.id, pool.organizerId);
    if (!organizerMembership) {
      throw new PoolAwaitingPaymentError();
    }

    // Equal Split joining is approval-gated (ticket #86): a Pool Code/Invite
    // Link no longer creates a Membership directly, it creates a JoinRequest
    // for the Organizer to Approve/Decline. Custom Split never reaches here
    // (it joins exclusively via Invitation) and OPEN keeps the old
    // direct-join behavior — both are unaffected by this change.
    if (pool.type === "EQUAL_SPLIT") {
      const joinRequest = await this.joinRequestService.requestToJoin(pool, userId);
      return { kind: "JOIN_REQUEST", joinRequest };
    }

    const membership = await this.membershipRepository.create(pool.id, userId, "MEMBER");
    return { kind: "MEMBERSHIP", membership };
  }
}
