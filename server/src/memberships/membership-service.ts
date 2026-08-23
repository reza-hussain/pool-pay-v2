import { NotPoolOrganizerError, type Pool, type PoolRepository } from "../pools/types.js";
import { expireIfLapsed } from "../pools/pool-expiry.js";
import type { InvitationRepository } from "../invitations/types.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolAwaitingPaymentError,
  PoolClosedError,
  PoolNotFoundError,
  type Membership,
  type MembershipRepository,
} from "./types.js";

export interface MembershipServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  invitationRepository: InvitationRepository;
}

export class MembershipService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly invitationRepository: InvitationRepository;

  constructor(options: MembershipServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.invitationRepository = options.invitationRepository;
  }

  async joinByPoolId(userId: string, poolId: string): Promise<Membership> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    return this.join(userId, pool);
  }

  async joinByCode(userId: string, joinCode: string): Promise<Membership> {
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

  private async join(userId: string, pool: Pool): Promise<Membership> {
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }
    // Locked only stops deposits (see CONTEXT.md / ADR 0006) — joining a
    // Locked Pool is still allowed, only Closed is end-of-life.

    const existing = await this.membershipRepository.find(pool.id, userId);
    if (existing) {
      return existing;
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

    return this.membershipRepository.create(pool.id, userId, "MEMBER");
  }
}
