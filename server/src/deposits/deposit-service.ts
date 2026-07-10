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
  UnknownDepositReferenceError,
  type ContributionSummary,
  type Deposit,
  type DepositRepository,
  type PendingDepositRepository,
} from "./types.js";

export interface DepositServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  pendingDepositRepository: PendingDepositRepository;
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
  private readonly pendingDepositRepository: PendingDepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: DepositServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.pendingDepositRepository = options.pendingDepositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.paymentProvider = options.paymentProvider;
  }

  async createDepositIntent(poolId: string, userId: string): Promise<DepositIntent> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    const fixedAmountPaise = pool.type === "EQUAL_SPLIT" ? pool.perPersonAmountPaise : null;
    const intent = await this.paymentProvider.createDepositIntent(pool.id, fixedAmountPaise);
    // Recorded before any money moves, so a later confirmation — self-report
    // or webhook, whichever arrives first (see confirmDeposit) — can be
    // attributed back to this Member without trusting the confirming party.
    await this.pendingDepositRepository.create(intent.id, poolId, userId);
    return intent;
  }

  // The one path that actually credits a Deposit — called by both the
  // client's self-report and the Payment Provider's webhook (ticket #15),
  // keyed by providerRef (DepositIntent.id) so whichever confirms first
  // wins and a repeat confirmation is a no-op rather than a double-credit.
  // `expected` lets the self-report router scope a confirmation to the
  // caller's own pool/session; the webhook (server-to-server, already
  // trusted) omits it.
  async confirmDeposit(
    providerRef: string,
    amountPaise: number,
    expected?: { poolId?: string; userId?: string },
  ): Promise<Deposit> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new InvalidDepositAmountError();
    }

    const pending = await this.pendingDepositRepository.findByProviderRef(providerRef);
    if (
      !pending ||
      (expected?.poolId && pending.poolId !== expected.poolId) ||
      (expected?.userId && pending.userId !== expected.userId)
    ) {
      throw new UnknownDepositReferenceError();
    }

    if (pending.consumedAt) {
      const existing = await this.depositRepository.findById(pending.resultingDepositId!);
      if (existing) {
        return existing;
      }
    }

    const pool = await this.poolRepository.findById(pending.poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.state !== "ACTIVE") {
      throw new PoolNotAcceptingDepositsError();
    }

    const membership = await this.membershipRepository.find(pending.poolId, pending.userId);
    if (!membership) {
      throw new NotAMemberError();
    }

    const deposit = await this.depositRepository.create(pending.poolId, pending.userId, amountPaise);
    await this.pendingDepositRepository.markConsumed(providerRef, deposit.id);
    return deposit;
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
