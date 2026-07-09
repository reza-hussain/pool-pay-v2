const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ReimbursementsApiError extends Error {}

export interface Reimbursement {
  id: string;
  poolId: string;
  memberId: string;
  vpa: string;
  amountPaise: number;
  createdAt: string;
}

export interface RecordReimbursementResult {
  reimbursement: Reimbursement;
  poolBalancePaise: number;
}

export async function recordReimbursement(
  token: string,
  poolId: string,
  memberId: string,
  vpa: string,
  amountPaise: number,
): Promise<RecordReimbursementResult> {
  const res = await fetch(`${API_URL}/pools/${poolId}/reimbursements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId, vpa, amountPaise }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ReimbursementsApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as RecordReimbursementResult;
}
