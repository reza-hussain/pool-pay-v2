const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class SpendsApiError extends Error {}

export interface Spend {
  id: string;
  poolId: string;
  userId: string;
  merchantRef: string;
  amountPaise: number;
  feePaise: number;
  createdAt: string;
}

// Two-tier spend authority (ADR-0020): a Spend larger than the recorder's
// own remaining balance is held here instead of executing immediately, and
// waits for majority Spend Approval — see spendApprovalsClient.ts.
export interface PendingSpend {
  id: string;
  poolId: string;
  recorderId: string;
  merchantRef: string;
  amountPaise: number;
  feePaise: number;
  state: "PENDING" | "EXECUTED";
  resultingSpendId: string | null;
  createdAt: string;
}

// Exactly one of `spend`/`pendingSpend` is set — `spend` when the recorder's
// own balance covered it and the transfer fired immediately, `pendingSpend`
// when it's held for majority approval instead (ADR-0020).
export interface RecordSpendResult {
  spend: Spend | null;
  pendingSpend: PendingSpend | null;
  poolBalancePaise: number;
}

export async function recordSpend(
  token: string,
  poolId: string,
  merchantRef: string,
  amountPaise: number,
): Promise<RecordSpendResult> {
  const res = await fetch(`${API_URL}/pools/${poolId}/spends`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ merchantRef, amountPaise }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SpendsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as RecordSpendResult;
}
