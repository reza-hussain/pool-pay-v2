const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ActivityApiError extends Error {}

export type ActivityEntryType = "DEPOSIT" | "REFUND";

export interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  poolId: string;
  poolName: string;
  amountPaise: number;
  counterpartyName: string;
  createdAt: string;
}

export async function getActivity(token: string): Promise<ActivityEntry[]> {
  const res = await fetch(`${API_URL}/activity`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ActivityApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.entries as ActivityEntry[];
}
