const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class DepositsApiError extends Error {}

export interface DepositIntent {
  id: string;
  poolId: string;
  vpa: string;
  fixedAmountPaise: number | null;
}

export interface Deposit {
  id: string;
  poolId: string;
  userId: string;
  amountPaise: number;
  createdAt: string;
}

export interface ContributionSummary {
  contributedPaise: number;
  expectedPaise: number | null;
  shortfallPaise: number | null;
}

export interface RecordDepositResult {
  deposit: Deposit;
  poolBalancePaise: number;
  contributionSummary: ContributionSummary;
}

async function authedFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DepositsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data;
}

export async function getDepositIntent(token: string, poolId: string): Promise<DepositIntent> {
  const data = await authedFetch(`/pools/${poolId}/deposit-intent`, token);
  return data.intent as DepositIntent;
}

export async function recordDeposit(
  token: string,
  poolId: string,
  depositIntentId: string,
  amountPaise: number,
): Promise<RecordDepositResult> {
  const data = await authedFetch(`/pools/${poolId}/deposits`, token, {
    method: "POST",
    body: JSON.stringify({ depositIntentId, amountPaise }),
  });
  return data as RecordDepositResult;
}
