import type { DepositRepository } from "../deposits/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";

// "Pool balance" is one concept shared across every money-movement flow even
// though each records its own ledger — extracted here once a third money-out
// flow made the formula worth not repeating a third time.
export interface PoolBalanceRepositories {
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
}

export async function getPoolBalance(
  repositories: PoolBalanceRepositories,
  poolId: string,
): Promise<number> {
  const [deposited, spent, reimbursed, refunded] = await Promise.all([
    repositories.depositRepository.sumByPool(poolId),
    repositories.spendRepository.sumByPool(poolId),
    repositories.reimbursementRepository.sumByPool(poolId),
    repositories.refundRepository.sumByPool(poolId),
  ]);
  return deposited - spent - reimbursed - refunded;
}
