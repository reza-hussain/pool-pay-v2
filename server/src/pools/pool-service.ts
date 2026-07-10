import { randomInt } from "node:crypto";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { UserRepository } from "../auth/types.js";
import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MaxActivePoolsExceededError,
  MissingPerPersonAmountError,
  NotPoolOrganizerError,
  OrganizerNotVerifiedError,
  UnexpectedPerPersonAmountError,
  type CreatePoolInput,
  type Pool,
  type PoolRepository,
  type PoolType,
} from "./types.js";

// Free-tier cap on concurrently Active Pools an Organizer may run (ticket
// #13, ADR 0011) — lifted entirely for a subscribed user.
const FREE_TIER_MAX_ACTIVE_POOLS = 3;

export interface PoolServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  userRepository: UserRepository;
  generateJoinCode?: () => string;
}

export class PoolService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly userRepository: UserRepository;
  private readonly generateJoinCode: () => string;

  constructor(options: PoolServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.userRepository = options.userRepository;
    this.generateJoinCode = options.generateJoinCode ?? defaultGenerateJoinCode;
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
      if (input.perPersonAmountPaise === undefined) {
        throw new MissingPerPersonAmountError();
      }
      if (!Number.isInteger(input.perPersonAmountPaise) || input.perPersonAmountPaise <= 0) {
        throw new InvalidPerPersonAmountError();
      }
      type = "EQUAL_SPLIT";
      perPersonAmountPaise = input.perPersonAmountPaise;
    } else {
      if (input.perPersonAmountPaise !== undefined) {
        throw new UnexpectedPerPersonAmountError();
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

    // The Organizer is also a Member (CONTEXT.md) — the row backing that must
    // exist as soon as the Pool does, before anyone else can join.
    await this.membershipRepository.create(pool.id, organizerId, "ORGANIZER");

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

    return this.poolRepository.updateState(poolId, "LOCKED");
  }
}

function defaultGenerateJoinCode(): string {
  return String(randomInt(100000, 1000000));
}
