import type { DepositRepository } from "../deposits/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import { NotAPoolMemberError, type LedgerEntry } from "./types.js";

export interface LedgerServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
}

export class LedgerService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;

  constructor(options: LedgerServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
  }

  async getLedger(poolId: string, userId: string): Promise<LedgerEntry[]> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }

    const [deposits, spends, reimbursements, refunds] = await Promise.all([
      this.depositRepository.listByPool(poolId),
      this.spendRepository.listByPool(poolId),
      this.reimbursementRepository.listByPool(poolId),
      this.refundRepository.listByPool(poolId),
    ]);

    const entries: LedgerEntry[] = [
      ...deposits.map(
        (deposit): LedgerEntry => ({
          id: deposit.id,
          type: "DEPOSIT",
          poolId,
          amountPaise: deposit.amountPaise,
          counterparty: deposit.userId,
          createdAt: deposit.createdAt,
        }),
      ),
      ...spends.map(
        (spend): LedgerEntry => ({
          id: spend.id,
          type: "SPEND",
          poolId,
          amountPaise: spend.amountPaise,
          feePaise: spend.feePaise,
          counterparty: spend.merchantRef,
          createdAt: spend.createdAt,
        }),
      ),
      ...reimbursements.map(
        (reimbursement): LedgerEntry => ({
          id: reimbursement.id,
          type: "REIMBURSEMENT",
          poolId,
          amountPaise: reimbursement.amountPaise,
          counterparty: reimbursement.memberId,
          createdAt: reimbursement.createdAt,
        }),
      ),
      ...refunds.map(
        (refund): LedgerEntry => ({
          id: refund.id,
          type: "REFUND",
          poolId,
          amountPaise: refund.amountPaise,
          counterparty: refund.memberId,
          createdAt: refund.createdAt,
        }),
      ),
    ];

    return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
