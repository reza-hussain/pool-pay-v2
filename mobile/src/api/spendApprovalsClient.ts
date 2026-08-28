import type { PendingSpend, Spend } from "./spendsClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class SpendApprovalsApiError extends Error {}

export interface SpendApprovalStatus {
  pendingSpend: PendingSpend;
  // Currently active Members of the Pool (ADR-0020) — recomputed live on
  // every call, not fixed at proposal time.
  eligibleApproverCount: number;
  approvalsCount: number;
  hasApproved: boolean;
}

export interface ApproveResult {
  status: SpendApprovalStatus;
  // Set only when this approval was the one that pushed the tally past
  // majority and triggered immediate execution (ADR-0020).
  executedSpend: Spend | null;
}

export async function listPendingSpends(token: string, poolId: string): Promise<SpendApprovalStatus[]> {
  const res = await fetch(`${API_URL}/pools/${poolId}/pending-spends`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SpendApprovalsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return (data as { pendingSpends: SpendApprovalStatus[] }).pendingSpends;
}

export async function getPendingSpendStatus(
  token: string,
  poolId: string,
  pendingSpendId: string,
): Promise<SpendApprovalStatus> {
  const res = await fetch(`${API_URL}/pools/${poolId}/pending-spends/${pendingSpendId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SpendApprovalsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as SpendApprovalStatus;
}

// Idempotent — approving a PendingSpend the caller already approved just
// returns its current status, not an error (RefundVote's one-vote-per-Member
// convention).
export async function approvePendingSpend(
  token: string,
  poolId: string,
  pendingSpendId: string,
): Promise<ApproveResult> {
  const res = await fetch(`${API_URL}/pools/${poolId}/pending-spends/${pendingSpendId}/approvals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SpendApprovalsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as ApproveResult;
}
