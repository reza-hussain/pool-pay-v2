import type { ClosureResult } from "./closureClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class VotesApiError extends Error {}

export interface VoteStatus {
  poolState: string;
  eligibleVoterCount: number;
  votesCast: number;
  hasVoted: boolean;
}

export interface CastVoteResult {
  status: VoteStatus;
  closure: ClosureResult | null;
}

export async function getVoteStatus(token: string, poolId: string): Promise<VoteStatus> {
  const res = await fetch(`${API_URL}/pools/${poolId}/refund-votes`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new VotesApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as VoteStatus;
}

export async function castRefundVote(token: string, poolId: string): Promise<CastVoteResult> {
  const res = await fetch(`${API_URL}/pools/${poolId}/refund-votes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new VotesApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as CastVoteResult;
}
