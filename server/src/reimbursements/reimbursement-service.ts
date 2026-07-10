import type { DepositRepository } from "../deposits/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import { NotPoolOrganizerError, type PoolRepository } from "../pools/types.js";
import type { PaymentProvider } from "../payments/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { RefundRepository } from "../closure/types.js";
import {
  InsufficientPoolBalanceError,
  InvalidReimbursementAmountError,
  InvalidVpaError,
  RecipientNotAMemberError,
  type Reimbursement,
  type ReimbursementRepository,
} from "./types.js";

export interface ReimbursementServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  paymentProvider: PaymentProvider;
}

export class ReimbursementService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: ReimbursementServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.paymentProvider = options.paymentProvider;
  }

  async recordReimbursement(
    poolId: string,
    userId: string,
    memberId: string,
    vpa: string,
    amountPaise: number,
  ): Promise<Reimbursement> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new InvalidReimbursementAmountError();
    }
    if (!vpa.trim()) {
      throw new InvalidVpaError();
    }

    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== userId) {
      throw new NotPoolOrganizerError();
    }

    const membership = await this.membershipRepository.find(poolId, memberId);
    if (!membership) {
      throw new RecipientNotAMemberError();
    }

    const balance = await this.getPoolBalance(poolId);
    if (amountPaise > balance) {
      throw new InsufficientPoolBalanceError();
    }

    await this.paymentProvider.initiateTransfer(poolId, vpa, amountPaise);
    return this.reimbursementRepository.create(poolId, memberId, vpa, amountPaise);
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
