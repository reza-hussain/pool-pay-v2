import type { DepositRepository } from "../deposits/types.js";
import type { SpendAttributionRepository } from "../spends/types.js";

// "Your Remaining Balance" (ADR-0022): a Member's own running balance within
// a Pool — their total Deposits minus their attributed share of every Spend
// recorded while they were active. Distinct from getPoolBalance (pools/
// pool-balance.ts), which is the Pool's actual custodied cash rather than
// any one Member's share of it.
export interface MemberBalanceRepositories {
  depositRepository: DepositRepository;
  spendAttributionRepository: SpendAttributionRepository;
}

export async function getMemberBalance(
  repositories: MemberBalanceRepositories,
  poolId: string,
  userId: string,
): Promise<number> {
  const [deposited, attributed] = await Promise.all([
    repositories.depositRepository.sumByPoolAndUser(poolId, userId),
    repositories.spendAttributionRepository.sumByPoolAndMember(poolId, userId),
  ]);
  return deposited - attributed;
}

// Every Member who has ever deposited into or been attributed a Spend in
// this Pool, regardless of current Membership status — a departed Member's
// balance still needs computing at Closure (see ClosureService), the same
// way their prior Deposits always counted toward pro-rata refunds before.
export async function getMemberBalances(
  repositories: MemberBalanceRepositories,
  poolId: string,
): Promise<Map<string, number>> {
  const [deposits, attributions] = await Promise.all([
    repositories.depositRepository.listByPool(poolId),
    repositories.spendAttributionRepository.listByPool(poolId),
  ]);

  const balances = new Map<string, number>();
  for (const deposit of deposits) {
    balances.set(deposit.userId, (balances.get(deposit.userId) ?? 0) + deposit.amountPaise);
  }
  for (const attribution of attributions) {
    balances.set(
      attribution.memberId,
      (balances.get(attribution.memberId) ?? 0) - attribution.amountPaise,
    );
  }
  return balances;
}
