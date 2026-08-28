import type { DepositRepository } from "../deposits/types.js";
import { getMemberBalance, getMemberBalances } from "../ledger/member-balance.js";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import type { PoolRepository } from "../pools/types.js";
import type { PaymentProvider } from "../payments/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import type { UserRepository } from "../auth/types.js";
import { maybeExecutePendingSpend } from "../spend-approvals/tally.js";
import type { PendingSpendRepository, SpendApprovalRepository } from "../spend-approvals/types.js";
import {
  InvalidMerchantReferenceError,
  InvalidSpendAmountError,
  NotAPoolMemberError,
  SpendUnaffordableByAnyMemberError,
  type RecordSpendResult,
  type Spend,
  type SpendAttributionRepository,
  type SpendRepository,
} from "./types.js";

// Pool Pay's own monetization (ADR 0010), not a payment-rail cost — deliberately
// not configurable via the PaymentProvider interface. Waived entirely for a
// subscribed recorder (ticket #13/#104, ADR 0011) — follows whichever Member
// actually records the Spend, not the Pool's Organizer.
const FEE_RATE = 0.01;

export interface SpendServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  spendAttributionRepository: SpendAttributionRepository;
  pendingSpendRepository: PendingSpendRepository;
  spendApprovalRepository: SpendApprovalRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  userRepository: UserRepository;
  paymentProvider: PaymentProvider;
}

export class SpendService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly spendAttributionRepository: SpendAttributionRepository;
  private readonly pendingSpendRepository: PendingSpendRepository;
  private readonly spendApprovalRepository: SpendApprovalRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly userRepository: UserRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: SpendServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.spendAttributionRepository = options.spendAttributionRepository;
    this.pendingSpendRepository = options.pendingSpendRepository;
    this.spendApprovalRepository = options.spendApprovalRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.userRepository = options.userRepository;
    this.paymentProvider = options.paymentProvider;
  }

  // Two-tier spend authority (ADR-0020, ticket #104): any active Member can
  // record a Spend. One at or below what they have left in their own
  // remaining balance (ADR-0022) fires immediately, exactly like Phase 1's
  // Organizer-only recordSpend did. One larger than their own balance is
  // held as a PendingSpend instead, with the recorder's own proposal
  // counting as their implicit first SpendApproval — which, for a small
  // enough Pool, can itself already be a majority (see
  // spend-approvals/tally.ts's maybeExecutePendingSpend).
  async recordSpend(
    poolId: string,
    userId: string,
    merchantRef: string,
    amountPaise: number,
  ): Promise<RecordSpendResult> {
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
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }

    const recorder = await this.userRepository.findById(userId);
    const feePaise = recorder?.isSubscribed ? 0 : Math.round(amountPaise * FEE_RATE);
    const totalCostPaise = amountPaise + feePaise;

    const recorderBalance = await getMemberBalance(
      { depositRepository: this.depositRepository, spendAttributionRepository: this.spendAttributionRepository },
      poolId,
      userId,
    );

    if (totalCostPaise <= recorderBalance) {
      const spend = await this.executeSpend(poolId, userId, merchantRef, amountPaise, feePaise);
      return { spend, pendingSpend: null };
    }

    const pendingSpend = await this.pendingSpendRepository.create(
      poolId,
      userId,
      merchantRef,
      amountPaise,
      feePaise,
    );
    await this.spendApprovalRepository.create(pendingSpend.id, poolId, userId);

    const { pendingSpend: updated, executedSpend } = await maybeExecutePendingSpend(
      { membershipRepository: this.membershipRepository, spendApprovalRepository: this.spendApprovalRepository, pendingSpendRepository: this.pendingSpendRepository },
      (executePoolId, recorderId, spendMerchantRef, spendAmountPaise, spendFeePaise) =>
        this.executeSpend(executePoolId, recorderId, spendMerchantRef, spendAmountPaise, spendFeePaise),
      pendingSpend,
    );

    if (executedSpend) {
      return { spend: executedSpend, pendingSpend: null };
    }
    return { spend: null, pendingSpend: updated };
  }

  // Actually moves the money: the equal-split-with-insolvency-sit-out
  // attribution (ADR-0021), computed fresh against current membership and
  // balances every time it's called — whether that's an immediate Spend
  // from recordSpend, or a PendingSpend finally clearing majority
  // (SpendApprovalService.approve), potentially long after it was proposed.
  async executeSpend(
    poolId: string,
    recorderId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ): Promise<Spend> {
    const shares = await this.computeEqualSplitShares(poolId, amountPaise + feePaise);

    await this.paymentProvider.initiateSpend(poolId, merchantRef, amountPaise);
    const spend = await this.spendRepository.create(poolId, recorderId, merchantRef, amountPaise, feePaise);
    await this.spendAttributionRepository.createForSpend(
      spend.id,
      poolId,
      [...shares].map(([memberId, share]) => ({ memberId, amountPaise: share })),
    );
    return spend;
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

  // Equal-split attribution with insolvency sit-out and cascade (ADR-0021):
  // split totalCostPaise equally among the Pool's currently active Members,
  // excluding (not partially charging) any Member whose own remaining
  // balance can't cover their full equal share, and re-splitting among the
  // rest — repeated until every Member left in the paying group can actually
  // afford their share. Throws once that shrinks the paying group to none.
  private async computeEqualSplitShares(
    poolId: string,
    totalCostPaise: number,
  ): Promise<Map<string, number>> {
    const memberships = await this.membershipRepository.listByPool(poolId);
    const balances = await getMemberBalances(
      { depositRepository: this.depositRepository, spendAttributionRepository: this.spendAttributionRepository },
      poolId,
    );

    let payerIds = memberships.map((membership) => membership.userId);

    while (true) {
      if (payerIds.length === 0) {
        throw new SpendUnaffordableByAnyMemberError();
      }

      const shares = splitEqually(payerIds, totalCostPaise);
      const insolventIds = payerIds.filter((id) => (balances.get(id) ?? 0) < (shares.get(id) ?? 0));

      if (insolventIds.length === 0) {
        return shares;
      }
      payerIds = payerIds.filter((id) => !insolventIds.includes(id));
    }
  }
}

// Largest-remainder split of totalPaise equally across payerIds: floor(total
// / n) each, plus the leftover paise handed out one at a time — sorted by
// id purely for determinism, since every payer's exact share has the same
// fractional part when splitting equally, so there's no "largest remainder"
// to prefer as there is in computeRefunds' proportional split.
function splitEqually(payerIds: string[], totalPaise: number): Map<string, number> {
  const n = payerIds.length;
  const base = Math.floor(totalPaise / n);
  const leftoverPaise = totalPaise - base * n;
  const sortedIds = [...payerIds].sort();

  const shares = new Map<string, number>();
  sortedIds.forEach((id, index) => {
    shares.set(id, base + (index < leftoverPaise ? 1 : 0));
  });
  return shares;
}
