import { PoolNotFoundError } from "../memberships/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import type { PoolRepository } from "../pools/types.js";
import type { DepositIntent, PaymentProvider } from "../payments/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
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
  // Needed so getPoolBalance reflects money spent/transferred out, not just
  // deposited — "Pool balance" is one concept even though Deposits, Spends,
  // Reimbursements, and Refunds are recorded by separate services/repositories.
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  paymentProvider: PaymentProvider;
}

export class DepositService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: DepositServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
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
    return getPoolBalance(
      {
        depositRepository: this.depositRepository,
        spendRepository: this.spendRepository,
        reimbursementRepository: this.reimbursementRepository,
        refundRepository: this.refundRepository,
      },
      poolId,
    );
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
