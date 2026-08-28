import { PoolNotFoundError } from "../memberships/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import { getMemberBalances } from "../ledger/member-balance.js";
import { NotPoolOrganizerError, type Pool, type PoolRepository } from "../pools/types.js";
import type { DepositRepository } from "../deposits/types.js";
import type { SpendAttributionRepository, SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { PaymentProvider } from "../payments/types.js";
import type { UserRepository } from "../auth/types.js";
import { MemberHasNoRegisteredUpiIdError } from "../reimbursements/types.js";
import { formatRupees } from "../lib/format-money.js";
import type { NotificationService } from "../notifications/notification-service.js";
import { PoolAlreadyClosedError, type Refund, type RefundRepository } from "./types.js";

export interface RefundBreakdownEntry {
  memberId: string;
  // Total Deposits, kept for display alongside the payout — no longer what
  // amountPaise is computed from (see computeRefundBreakdown, ADR-0022).
  contributedPaise: number;
  amountPaise: number;
}

export interface ClosurePreview {
  refundTotalPaise: number;
  refunds: RefundBreakdownEntry[];
}

export interface ClosureRefund extends Refund {
  contributedPaise: number;
}

export interface ClosureResult {
  pool: Pool;
  refundTotalPaise: number;
  refunds: ClosureRefund[];
}

export interface ClosureServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  spendAttributionRepository: SpendAttributionRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  userRepository: UserRepository;
  paymentProvider: PaymentProvider;
  notificationService: NotificationService;
}

export class ClosureService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly spendAttributionRepository: SpendAttributionRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly userRepository: UserRepository;
  private readonly paymentProvider: PaymentProvider;
  private readonly notificationService: NotificationService;

  constructor(options: ClosureServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.spendAttributionRepository = options.spendAttributionRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.userRepository = options.userRepository;
    this.paymentProvider = options.paymentProvider;
    this.notificationService = options.notificationService;
  }

  async previewClosure(poolId: string, userId: string): Promise<ClosurePreview> {
    await this.requireOrganizerOfOpenPool(poolId, userId);
    const breakdown = await this.computeRefundBreakdown(poolId);
    return {
      refundTotalPaise: breakdown.reduce((sum, entry) => sum + entry.amountPaise, 0),
      refunds: breakdown,
    };
  }

  async closePool(poolId: string, userId: string): Promise<ClosureResult> {
    const pool = await this.requireOrganizerOfOpenPool(poolId, userId);
    return this.performClosure(pool);
  }

  // The vote path (ADR 0009) reuses this exact Closure/refund mechanism but
  // isn't authorized by the Organizer — it's authorized by VoteService having
  // already confirmed a majority. No Organizer check here by design.
  async closePoolViaVote(poolId: string): Promise<ClosureResult> {
    const pool = await this.requireOpenPool(poolId);
    return this.performClosure(pool);
  }

  private async performClosure(pool: Pool): Promise<ClosureResult> {
    const breakdown = await this.computeRefundBreakdown(pool.id);

    // Registered UPI ID from Onboarding (ADR 0012) is the real refund
    // destination, and every Member is expected to have one — Onboarding
    // gates all Pool interaction (see CONTEXT.md), so a Member with none is
    // an error condition, not a case to degrade around. Checked for every
    // Member up front so Closure fails atomically before any transfer goes
    // out, rather than mid-batch after some refunds already landed.
    const members = await Promise.all(
      breakdown.map((entry) => this.userRepository.findById(entry.memberId)),
    );
    if (members.some((member) => !member?.upiId)) {
      throw new MemberHasNoRegisteredUpiIdError();
    }

    const refunds: ClosureRefund[] = [];
    for (const [index, entry] of breakdown.entries()) {
      const vpa = members[index]!.upiId as string;
      await this.paymentProvider.initiateTransfer(pool.id, vpa, entry.amountPaise);
      const refund = await this.refundRepository.create(pool.id, entry.memberId, vpa, entry.amountPaise);
      refunds.push({ ...refund, contributedPaise: entry.contributedPaise });
      // Refund goes to the specific recipient only — unlike Deposit/Lock,
      // this isn't a Pool-wide event other Members need to hear about.
      await this.notificationService.notify({
        recipientUserIds: [entry.memberId],
        poolId: pool.id,
        type: "REFUND_PROCESSED",
        message: `Refund of ${formatRupees(entry.amountPaise)} processed for ${pool.name}`,
      });
    }

    const closedPool = await this.poolRepository.updateState(pool.id, "CLOSED");

    return {
      pool: closedPool,
      refundTotalPaise: breakdown.reduce((sum, entry) => sum + entry.amountPaise, 0),
      refunds,
    };
  }

  private async requireOpenPool(poolId: string): Promise<Pool> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.state === "CLOSED") {
      throw new PoolAlreadyClosedError();
    }
    return pool;
  }

  private async requireOrganizerOfOpenPool(poolId: string, userId: string): Promise<Pool> {
    const pool = await this.requireOpenPool(poolId);
    if (pool.organizerId !== userId) {
      throw new NotPoolOrganizerError();
    }
    return pool;
  }

  // Refunds are each Member's own remaining balance (ADR-0022) — Deposits
  // minus their attributed Spend share — not a pro-rata share of the Pool's
  // leftover. The only reason those balances could ever add up to more than
  // the Pool's actual custodied cash is Reimbursements (a separate,
  // pre-existing, cash-reducing mechanism this ticket doesn't otherwise
  // touch): computeRefunds' proportional largest-remainder split, reused
  // here with each Member's balance as its weight, both caps the payout at
  // that actual cash and scales every Member down by the identical
  // proportion when there's a shortfall — and is a no-op (exact balances,
  // no rounding) whenever there isn't one.
  private async computeRefundBreakdown(poolId: string): Promise<RefundBreakdownEntry[]> {
    const [actualCashPaise, balances, deposits, priorRefunds] = await Promise.all([
      getPoolBalance(
        {
          depositRepository: this.depositRepository,
          spendRepository: this.spendRepository,
          reimbursementRepository: this.reimbursementRepository,
          refundRepository: this.refundRepository,
        },
        poolId,
      ),
      getMemberBalances(
        {
          depositRepository: this.depositRepository,
          spendAttributionRepository: this.spendAttributionRepository,
        },
        poolId,
      ),
      this.depositRepository.listByPool(poolId),
      this.refundRepository.listByPool(poolId),
    ]);

    const totalContributedByMember = new Map<string, number>();
    for (const deposit of deposits) {
      totalContributedByMember.set(
        deposit.userId,
        (totalContributedByMember.get(deposit.userId) ?? 0) + deposit.amountPaise,
      );
    }

    // A Member who already Departed (self-leave or Organizer removal, ADR-
    // 0022/0023) was already paid their remaining balance at that moment,
    // recorded as a Refund the same as any Closure payout — netting it out
    // here keeps balances in sync with actualCashPaise (which already
    // subtracts every prior Refund via getPoolBalance) so a Departure's
    // early payout is never counted twice: once at Departure, again here.
    for (const refund of priorRefunds) {
      balances.set(refund.memberId, (balances.get(refund.memberId) ?? 0) - refund.amountPaise);
    }

    return computeRefunds(balances, actualCashPaise).map((payout) => ({
      memberId: payout.memberId,
      contributedPaise: totalContributedByMember.get(payout.memberId) ?? 0,
      amountPaise: payout.amountPaise,
    }));
  }
}

// Largest-remainder method: floor each Member's exact proportional share of
// remainingBalancePaise (weighted by `contributions`), then hand out the
// paise lost to rounding one at a time, to the largest fractional
// remainders first — so refunds always sum to exactly remainingBalancePaise
// regardless of how unevenly the weights split. computeRefundBreakdown
// weights this by each Member's own remaining balance (ADR-0022) rather
// than their total Deposit contribution, which is what caps the payout at
// the Pool's actual cash and scales every Member down by the same
// proportion on a Reimbursement-driven shortfall, for free.
export function computeRefunds(
  contributions: Map<string, number>,
  remainingBalancePaise: number,
): RefundBreakdownEntry[] {
  if (remainingBalancePaise <= 0) {
    return [];
  }

  const totalContributedPaise = [...contributions.values()].reduce((sum, v) => sum + v, 0);
  if (totalContributedPaise <= 0) {
    return [];
  }

  const shares = [...contributions.entries()]
    .filter(([, contributedPaise]) => contributedPaise > 0)
    .map(([memberId, contributedPaise]) => {
      const exact = (remainingBalancePaise * contributedPaise) / totalContributedPaise;
      const floor = Math.floor(exact);
      return { memberId, contributedPaise, amountPaise: floor, remainder: exact - floor };
    });

  let leftoverPaise =
    remainingBalancePaise - shares.reduce((sum, share) => sum + share.amountPaise, 0);

  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftoverPaise <= 0) break;
    share.amountPaise += 1;
    leftoverPaise -= 1;
  }

  return shares
    .filter((share) => share.amountPaise > 0)
    .map(({ memberId, contributedPaise, amountPaise }) => ({ memberId, contributedPaise, amountPaise }));
}
