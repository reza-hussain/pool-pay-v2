import { useEffect, useState } from "react";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class LedgerApiError extends Error {}

export type LedgerEntryType = "DEPOSIT" | "SPEND" | "REIMBURSEMENT" | "REFUND";

// docs/design/README.md: green is scoped to "money in: deposits, refunds
// received" — REIMBURSEMENT/SPEND are money leaving the Pool, not money in.
export function isMoneyIn(type: LedgerEntryType): boolean {
  return type === "DEPOSIT" || type === "REFUND";
}

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  poolId: string;
  amountPaise: number;
  feePaise?: number;
  counterparty: string;
  // Only set for SPEND entries — the Member who initiated the Transfer out,
  // separate from `counterparty` (the merchant reference for a Spend). Lets
  // Transaction Detail (ADR-0018) show and link to who actually spent the money.
  spendActorUserId?: string;
  createdAt: string;
}

export interface LedgerQuery {
  from?: string;
  to?: string;
  search?: string;
  counterparty?: string;
  types?: LedgerEntryType[];
  cursor?: string;
  limit?: number;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  nextCursor: string | null;
}

export async function getLedger(
  token: string,
  poolId: string,
  query: LedgerQuery = {},
): Promise<LedgerPage> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.search) params.set("search", query.search);
  if (query.counterparty) params.set("counterparty", query.counterparty);
  if (query.types && query.types.length > 0) params.set("types", query.types.join(","));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();

  const res = await fetch(`${API_URL}/pools/${poolId}/ledger${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LedgerApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return { entries: data.entries as LedgerEntry[], nextCursor: (data.nextCursor as string | null) ?? null };
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
        .then((page) => {
          if (!cancelled) setEntries(page.entries);
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
