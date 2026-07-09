import type { PoolRepository } from "../pools/types.js";
import {
  InvalidJoinCodeError,
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
    return this.join(userId, pool.id, pool.state);
  }

  async joinByCode(userId: string, joinCode: string): Promise<Membership> {
    const pool = await this.poolRepository.findByJoinCode(joinCode);
    if (!pool) {
      throw new InvalidJoinCodeError();
    }
    return this.join(userId, pool.id, pool.state);
  }

  async listMembers(poolId: string): Promise<Membership[]> {
    return this.membershipRepository.listByPool(poolId);
  }

  private async join(
    userId: string,
    poolId: string,
    poolState: string,
  ): Promise<Membership> {
    if (poolState === "CLOSED") {
      throw new PoolClosedError();
    }

    const existing = await this.membershipRepository.find(poolId, userId);
    if (existing) {
      return existing;
    }
    return this.membershipRepository.create(poolId, userId, "MEMBER");
  }
}
