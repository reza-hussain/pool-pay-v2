import { NotPoolOrganizerError, type Pool, type PoolRepository } from "../pools/types.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolClosedError,
  PoolNotFoundError,
  type Membership,
  type MembershipRepository,
} from "./types.js";

export interface MembershipServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
}

export class MembershipService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;

  constructor(options: MembershipServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
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
    return this.membershipRepository.create(pool.id, userId, "MEMBER");
  }
}
