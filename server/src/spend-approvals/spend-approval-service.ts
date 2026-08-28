import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import type { Spend } from "../spends/types.js";
import type { SpendService } from "../spends/spend-service.js";
import { maybeExecutePendingSpend, tallyPendingSpend } from "./tally.js";
import {
  NotAPoolMemberError,
  PendingSpendNotFoundError,
  type PendingSpend,
  type PendingSpendRepository,
  type SpendApproval,
  type SpendApprovalRepository,
  type SpendApprovalStatus,
} from "./types.js";

export interface ApproveResult {
  approval: SpendApproval;
  status: SpendApprovalStatus;
  // Set only when this approval was the one that pushed the tally past
  // majority and triggered immediate execution (ADR-0020).
  executedSpend: Spend | null;
}

export interface SpendApprovalServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  pendingSpendRepository: PendingSpendRepository;
  spendApprovalRepository: SpendApprovalRepository;
  spendService: SpendService;
}

export class SpendApprovalService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly pendingSpendRepository: PendingSpendRepository;
  private readonly spendApprovalRepository: SpendApprovalRepository;
  private readonly spendService: SpendService;

  constructor(options: SpendApprovalServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.pendingSpendRepository = options.pendingSpendRepository;
    this.spendApprovalRepository = options.spendApprovalRepository;
    this.spendService = options.spendService;
  }

  async listPending(poolId: string, userId: string): Promise<SpendApprovalStatus[]> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }

    const pendingSpends = await this.pendingSpendRepository.listPendingByPool(poolId);
    return Promise.all(pendingSpends.map((pendingSpend) => this.buildStatus(pendingSpend, userId)));
  }

  async getStatus(pendingSpendId: string, poolId: string, userId: string): Promise<SpendApprovalStatus> {
    const pendingSpend = await this.findPendingSpend(pendingSpendId, poolId);

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }

    return this.buildStatus(pendingSpend, userId);
  }

  // Records userId's approval (idempotent — a repeat approval is a no-op,
  // matching RefundVote's one-vote-per-Member convention) and, the moment
  // that pushes the tally past a majority of the Pool's currently active
  // Members, executes the Spend via the same equal-split/insolvency-sit-out
  // path Phase 1 built for immediate Spends — computed fresh against
  // membership and balances right now, not at proposal time (ADR-0020).
  async approve(pendingSpendId: string, poolId: string, userId: string): Promise<ApproveResult> {
    const pendingSpend = await this.findPendingSpend(pendingSpendId, poolId);

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

    const approval = await this.spendApprovalRepository.create(pendingSpendId, poolId, userId);

    const { pendingSpend: updated, executedSpend } = await maybeExecutePendingSpend(
      {
        membershipRepository: this.membershipRepository,
        spendApprovalRepository: this.spendApprovalRepository,
        pendingSpendRepository: this.pendingSpendRepository,
      },
      (executePoolId, recorderId, merchantRef, amountPaise, feePaise) =>
        this.spendService.executeSpend(executePoolId, recorderId, merchantRef, amountPaise, feePaise),
      pendingSpend,
    );

    const status = await this.buildStatus(updated, userId);
    return { approval, status, executedSpend };
  }

  private async findPendingSpend(pendingSpendId: string, poolId: string): Promise<PendingSpend> {
    const pendingSpend = await this.pendingSpendRepository.findById(pendingSpendId);
    if (!pendingSpend || pendingSpend.poolId !== poolId) {
      throw new PendingSpendNotFoundError();
    }
    return pendingSpend;
  }

  private async buildStatus(pendingSpend: PendingSpend, userId: string): Promise<SpendApprovalStatus> {
    const [tally, myApproval] = await Promise.all([
      tallyPendingSpend(
        { membershipRepository: this.membershipRepository, spendApprovalRepository: this.spendApprovalRepository },
        pendingSpend,
      ),
      this.spendApprovalRepository.find(pendingSpend.id, userId),
    ]);
    return {
      pendingSpend,
      eligibleApproverCount: tally.eligibleApproverCount,
      approvalsCount: tally.approvalsCount,
      hasApproved: myApproval !== null,
    };
  }
}
