import type { DepositRepository } from "../deposits/types.js";
import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import { NotPoolOrganizerError, type PoolRepository } from "../pools/types.js";
import type { PaymentProvider } from "../payments/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import type { UserRepository } from "../auth/types.js";
import {
  InsufficientPoolBalanceError,
  InvalidMerchantReferenceError,
  InvalidSpendAmountError,
  type Spend,
  type SpendRepository,
} from "./types.js";

// Pool Pay's own monetization (ADR 0010), not a payment-rail cost — deliberately
// not configurable via the PaymentProvider interface. Waived entirely for a
// subscribed Organizer (ticket #13, ADR 0011).
const FEE_RATE = 0.01;

export interface SpendServiceOptions {
  poolRepository: PoolRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  userRepository: UserRepository;
  paymentProvider: PaymentProvider;
}

export class SpendService {
  private readonly poolRepository: PoolRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly userRepository: UserRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: SpendServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.userRepository = options.userRepository;
    this.paymentProvider = options.paymentProvider;
  }

  async recordSpend(
    poolId: string,
    userId: string,
    merchantRef: string,
    amountPaise: number,
  ): Promise<Spend> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new InvalidSpendAmountError();
    }
    if (!merchantRef.trim()) {
      throw new InvalidMerchantReferenceError();
    }

    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== userId) {
      throw new NotPoolOrganizerError();
    }
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }

    const organizer = await this.userRepository.findById(userId);
    const feePaise = organizer?.isSubscribed ? 0 : Math.round(amountPaise * FEE_RATE);
    const balance = await this.getPoolBalance(poolId);
    if (amountPaise + feePaise > balance) {
      throw new InsufficientPoolBalanceError();
    }

    await this.paymentProvider.initiateSpend(poolId, merchantRef, amountPaise);
    return this.spendRepository.create(poolId, userId, merchantRef, amountPaise, feePaise);
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
}
