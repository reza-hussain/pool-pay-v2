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

export interface RecordSpendResult {
  spend: Spend;
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
