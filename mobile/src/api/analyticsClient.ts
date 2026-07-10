const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class AnalyticsApiError extends Error {}

export interface MerchantBreakdownEntry {
  merchantRef: string;
  amountPaise: number;
}

export interface CrossPoolAnalytics {
  poolCount: number;
  totalSpendPaise: number;
  byMerchant: MerchantBreakdownEntry[];
}

export async function getCrossPoolAnalytics(token: string): Promise<CrossPoolAnalytics> {
  const res = await fetch(`${API_URL}/analytics/cross-pool`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AnalyticsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as CrossPoolAnalytics;
}
