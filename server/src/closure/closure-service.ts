import { PoolNotFoundError } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import { NotPoolOrganizerError, type Pool, type PoolRepository } from "../pools/types.js";
import type { DepositRepository } from "../deposits/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { PaymentProvider } from "../payments/types.js";
import { PoolAlreadyClosedError, type Refund, type RefundRepository } from "./types.js";

export interface RefundBreakdownEntry {
  memberId: string;
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
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  paymentProvider: PaymentProvider;
}

export class ClosureService {
  private readonly poolRepository: PoolRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: ClosureServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.paymentProvider = options.paymentProvider;
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
    await this.requireOrganizerOfOpenPool(poolId, userId);
    const breakdown = await this.computeRefundBreakdown(poolId);

    const refunds: ClosureRefund[] = [];
    for (const entry of breakdown) {
      // No linked-VPA storage exists yet (no ticket has added one) — synthesized
      // the same way a Deposit's fake intent VPA is, per FakePaymentProvider.
      const vpa = `${entry.memberId}@fakebank`;
      await this.paymentProvider.initiateTransfer(poolId, vpa, entry.amountPaise);
      const refund = await this.refundRepository.create(poolId, entry.memberId, vpa, entry.amountPaise);
      refunds.push({ ...refund, contributedPaise: entry.contributedPaise });
    }

    const pool = await this.poolRepository.updateState(poolId, "CLOSED");

    return {
      pool,
      refundTotalPaise: breakdown.reduce((sum, entry) => sum + entry.amountPaise, 0),
      refunds,
    };
  }

  private async requireOrganizerOfOpenPool(poolId: string, userId: string): Promise<Pool> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== userId) {
      throw new NotPoolOrganizerError();
    }
    if (pool.state === "CLOSED") {
      throw new PoolAlreadyClosedError();
    }
    return pool;
  }

  private async computeRefundBreakdown(poolId: string): Promise<RefundBreakdownEntry[]> {
    const [remainingBalancePaise, deposits] = await Promise.all([
      getPoolBalance(
        {
          depositRepository: this.depositRepository,
          spendRepository: this.spendRepository,
          reimbursementRepository: this.reimbursementRepository,
          refundRepository: this.refundRepository,
        },
        poolId,
      ),
      this.depositRepository.listByPool(poolId),
    ]);

    const contributions = new Map<string, number>();
    for (const deposit of deposits) {
      contributions.set(deposit.userId, (contributions.get(deposit.userId) ?? 0) + deposit.amountPaise);
    }

    return computeRefunds(contributions, remainingBalancePaise);
  }
}

// Largest-remainder method: floor each Member's exact pro-rata share, then
// hand out the paise lost to rounding one at a time, to the largest
// fractional remainders first — so refunds always sum to exactly the
// remaining balance regardless of how unevenly contributions split.
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
