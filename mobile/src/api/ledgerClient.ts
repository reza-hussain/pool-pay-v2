import { useEffect, useState } from "react";

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

// No websocket/SSE infra exists in this codebase — polling while a screen is
// open is the established way to keep the ledger fresh without a manual
// refresh, matching the REST pattern used everywhere else here. Shared by
// LedgerScreen and PoolDetailScreen so both surfaces stay in sync on one
// fetch/poll implementation rather than two copies drifting apart.
const POLL_INTERVAL_MS = 4000;

export function usePolledLedger(token: string, poolId: string): { entries: LedgerEntry[]; error: string | null } {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function fetchLedger() {
      getLedger(token, poolId)
        .then((result) => {
          if (!cancelled) setEntries(result);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
        });
    }

    fetchLedger();
    const interval = setInterval(fetchLedger, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poolId, token]);

  return { entries, error };
}
