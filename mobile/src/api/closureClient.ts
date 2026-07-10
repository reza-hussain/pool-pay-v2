import type { Pool } from "./poolsClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ClosureApiError extends Error {}

export interface RefundBreakdownEntry {
  memberId: string;
  contributedPaise: number;
  amountPaise: number;
}

export interface ClosurePreview {
  refundTotalPaise: number;
  refunds: RefundBreakdownEntry[];
}

export interface ClosureRefund {
  id: string;
  poolId: string;
  memberId: string;
  vpa: string;
  contributedPaise: number;
  amountPaise: number;
  createdAt: string;
}

export interface ClosureResult {
  pool: Pool;
  refundTotalPaise: number;
  refunds: ClosureRefund[];
}

export async function getClosurePreview(token: string, poolId: string): Promise<ClosurePreview> {
  const res = await fetch(`${API_URL}/pools/${poolId}/close/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClosureApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as ClosurePreview;
}

export async function closePool(token: string, poolId: string): Promise<ClosureResult> {
  const res = await fetch(`${API_URL}/pools/${poolId}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClosureApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as ClosureResult;
}
