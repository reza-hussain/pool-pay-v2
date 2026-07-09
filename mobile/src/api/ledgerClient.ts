const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class LedgerApiError extends Error {}

export type LedgerEntryType = "DEPOSIT" | "SPEND" | "REIMBURSEMENT";

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  poolId: string;
  amountPaise: number;
  feePaise?: number;
  counterparty: string;
  createdAt: string;
}

export async function getLedger(token: string, poolId: string): Promise<LedgerEntry[]> {
  const res = await fetch(`${API_URL}/pools/${poolId}/ledger`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LedgerApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.entries as LedgerEntry[];
}
