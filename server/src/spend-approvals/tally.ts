import type { MembershipRepository } from "../memberships/types.js";
import type { Spend } from "../spends/types.js";
import type { PendingSpend, PendingSpendRepository, SpendApprovalRepository } from "./types.js";

// Shared by SpendService (the recorder's own proposal counts as an implicit
// first approval — see recordSpend) and SpendApprovalService (every
// subsequent approve() call), so a majority reached either way is detected
// and executed the same way.
export interface SpendApprovalTallyRepositories {
  membershipRepository: MembershipRepository;
  spendApprovalRepository: SpendApprovalRepository;
}

export async function tallyPendingSpend(
  repositories: SpendApprovalTallyRepositories,
  pendingSpend: PendingSpend,
): Promise<{ eligibleApproverCount: number; approvalsCount: number }> {
  const [memberships, approvals] = await Promise.all([
    repositories.membershipRepository.listByPool(pendingSpend.poolId),
    repositories.spendApprovalRepository.listByPendingSpend(pendingSpend.id),
  ]);
  return { eligibleApproverCount: memberships.length, approvalsCount: approvals.length };
}

// More than half of the Pool's currently active Members (ADR-0020) — unlike
// the emergency-refund vote (ADR-0009), there is no Organizer exclusion
// here, since spend authority isn't tied to the Organizer role at all
// (ADR-0023).
export function hasMajority(eligibleApproverCount: number, approvalsCount: number): boolean {
  return eligibleApproverCount > 0 && approvalsCount * 2 > eligibleApproverCount;
}

// Re-tallies a PendingSpend and, if majority is now reached, executes it —
// used both by SpendService.recordSpend (the recorder's own implicit first
// approval can itself already be a majority, e.g. a two-active-Member Pool)
// and SpendApprovalService.approve. `executeSpend` is passed in rather than
// a SpendService instance so this module doesn't depend on spends/
// spend-service.ts, which itself depends on this module — see
// SpendService.recordSpend and SpendApprovalService.approve for the actual
// callers.
export async function maybeExecutePendingSpend(
  repositories: SpendApprovalTallyRepositories & { pendingSpendRepository: PendingSpendRepository },
  executeSpend: (
    poolId: string,
    recorderId: string,
    merchantRef: string,
    amountPaise: number,
    feePaise: number,
  ) => Promise<Spend>,
  pendingSpend: PendingSpend,
): Promise<{ pendingSpend: PendingSpend; executedSpend: Spend | null }> {
  if (pendingSpend.state === "EXECUTED") {
    return { pendingSpend, executedSpend: null };
  }

  const tally = await tallyPendingSpend(repositories, pendingSpend);
  if (!hasMajority(tally.eligibleApproverCount, tally.approvalsCount)) {
    return { pendingSpend, executedSpend: null };
  }

  const executedSpend = await executeSpend(
    pendingSpend.poolId,
    pendingSpend.recorderId,
    pendingSpend.merchantRef,
    pendingSpend.amountPaise,
    pendingSpend.feePaise,
  );
  const updated = await repositories.pendingSpendRepository.markExecuted(pendingSpend.id, executedSpend.id);
  return { pendingSpend: updated, executedSpend };
}
