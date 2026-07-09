import type { DepositRepository } from "../deposits/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";

// "Pool balance" is one concept shared by Deposit, Spend, and Reimbursement
// services even though each records its own ledger — extracted here once a
// third money-out flow made the formula worth not repeating a third time.
// Superseded by a proper shared ledger once ticket #8 builds one.
export interface PoolBalanceRepositories {
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
}

export async function getPoolBalance(
  repositories: PoolBalanceRepositories,
  poolId: string,
): Promise<number> {
  const [deposited, spent, reimbursed] = await Promise.all([
    repositories.depositRepository.sumByPool(poolId),
    repositories.spendRepository.sumByPool(poolId),
    repositories.reimbursementRepository.sumByPool(poolId),
  ]);
  return deposited - spent - reimbursed;
}
