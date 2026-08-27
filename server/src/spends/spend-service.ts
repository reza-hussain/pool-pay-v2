import type { DepositRepository } from "../deposits/types.js";
import { getMemberBalances } from "../ledger/member-balance.js";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import { NotPoolOrganizerError, type PoolRepository } from "../pools/types.js";
import type { PaymentProvider } from "../payments/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import type { UserRepository } from "../auth/types.js";
import {
  InvalidMerchantReferenceError,
  InvalidSpendAmountError,
  SpendUnaffordableByAnyMemberError,
  type Spend,
  type SpendAttributionRepository,
  type SpendRepository,
} from "./types.js";

// Pool Pay's own monetization (ADR 0010), not a payment-rail cost — deliberately
// not configurable via the PaymentProvider interface. Waived entirely for a
// subscribed Organizer (ticket #13, ADR 0011).
const FEE_RATE = 0.01;

export interface SpendServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  spendAttributionRepository: SpendAttributionRepository;
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
    const totalCostPaise = amountPaise + feePaise;

    const shares = await this.computeEqualSplitShares(poolId, totalCostPaise);

    await this.paymentProvider.initiateSpend(poolId, merchantRef, amountPaise);
    const spend = await this.spendRepository.create(poolId, userId, merchantRef, amountPaise, feePaise);
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
