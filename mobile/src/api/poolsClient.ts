const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class PoolsApiError extends Error {}

export interface Pool {
  id: string;
  name: string;
  type: "EQUAL_SPLIT" | "OPEN";
  perPersonAmountPaise: number | null;
  state: "ACTIVE" | "LOCKED" | "CLOSED";
  organizerId: string;
  createdAt: string;
}

export interface CreatePoolInput {
  name: string;
  type: "EQUAL_SPLIT" | "OPEN";
  perPersonAmountPaise?: number;
}

export async function createPool(token: string, input: CreatePoolInput): Promise<Pool> {
  const res = await fetch(`${API_URL}/pools`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PoolsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.pool as Pool;
}
