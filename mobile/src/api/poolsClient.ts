const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class PoolsApiError extends Error {}

export interface Pool {
  id: string;
  name: string;
  type: "EQUAL_SPLIT" | "OPEN" | "CUSTOM_SPLIT";
  perPersonAmountPaise: number | null;
  // EXPIRED (ADR-0017): the Organizer's self-Invitation lapsed unpaid 24h
  // after creation — terminal, distinct from Closed (no money was ever
  // collected, so no refund logic applies).
  state: "ACTIVE" | "LOCKED" | "CLOSED" | "EXPIRED";
  organizerId: string;
  createdAt: string;
  joinCode: string;
}

export interface CreatePoolInput {
  name: string;
  type: "EQUAL_SPLIT" | "CUSTOM_SPLIT";
  perPersonAmountPaise?: number;
  // CUSTOM_SPLIT only — the Organizer's own assigned share, paid via a
  // self-addressed Invitation before the Dashboard unlocks (ADR-0016/0017).
  organizerShareAmountPaise?: number;
}

// Shared across every screen that displays a Pool's type as a short label
// (PoolDetailScreen, PoolsHomeScreen, AwaitingPaymentScreen) so the three
// type names live in exactly one place.
export function poolTypeLabel(type: Pool["type"]): string {
  switch (type) {
    case "EQUAL_SPLIT":
      return "Equal Split";
    case "CUSTOM_SPLIT":
      return "Custom Split";
    case "OPEN":
      return "Open Pool";
  }
}

export async function listPools(token: string): Promise<Pool[]> {
  const res = await fetch(`${API_URL}/pools`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PoolsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.pools as Pool[];
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

export async function lockPool(token: string, poolId: string): Promise<Pool> {
  const res = await fetch(`${API_URL}/pools/${poolId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PoolsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.pool as Pool;
}
