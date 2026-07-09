import { PoolNotFoundError } from "../memberships/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import type { DepositIntent, PaymentProvider } from "../payments/types.js";
import {
  InvalidDepositAmountError,
  NotAMemberError,
  PoolNotAcceptingDepositsError,
  type ContributionSummary,
  type Deposit,
  type DepositRepository,
} from "./types.js";

export interface DepositServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  paymentProvider: PaymentProvider;
}

export class DepositService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: DepositServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.paymentProvider = options.paymentProvider;
  }

  async createDepositIntent(poolId: string): Promise<DepositIntent> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    const fixedAmountPaise = pool.type === "EQUAL_SPLIT" ? pool.perPersonAmountPaise : null;
    return this.paymentProvider.createDepositIntent(pool.id, fixedAmountPaise);
  }

  async recordDeposit(poolId: string, userId: string, amountPaise: number): Promise<Deposit> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new InvalidDepositAmountError();
    }

    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.state !== "ACTIVE") {
      throw new PoolNotAcceptingDepositsError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAMemberError();
    }

    return this.depositRepository.create(poolId, userId, amountPaise);
  }

  async getPoolBalance(poolId: string): Promise<number> {
    return this.depositRepository.sumByPool(poolId);
  }

  async getContributionSummary(poolId: string, userId: string): Promise<ContributionSummary> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }

    const contributedPaise = await this.depositRepository.sumByPoolAndUser(poolId, userId);
    const expectedPaise = pool.type === "EQUAL_SPLIT" ? pool.perPersonAmountPaise : null;

    return {
      contributedPaise,
      expectedPaise,
      shortfallPaise: expectedPaise !== null ? expectedPaise - contributedPaise : null,
    };
  }
}
