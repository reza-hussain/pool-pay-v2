import { randomInt } from "node:crypto";
import type { MembershipRepository } from "../memberships/types.js";
import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MissingPerPersonAmountError,
  UnexpectedPerPersonAmountError,
  type CreatePoolInput,
  type Pool,
  type PoolRepository,
  type PoolType,
} from "./types.js";

export interface PoolServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  generateJoinCode?: () => string;
}

export class PoolService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly generateJoinCode: () => string;

  constructor(options: PoolServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.generateJoinCode = options.generateJoinCode ?? defaultGenerateJoinCode;
  }

  async createPool(organizerId: string, input: CreatePoolInput): Promise<Pool> {
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
}

function defaultGenerateJoinCode(): string {
  return String(randomInt(100000, 1000000));
}
