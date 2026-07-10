import type { RefundVote, RefundVoteRepository } from "../types.js";

let nextId = 1;

export class InMemoryRefundVoteRepository implements RefundVoteRepository {
  votes: RefundVote[] = [];

  async create(poolId: string, userId: string): Promise<RefundVote> {
    const existing = await this.find(poolId, userId);
    if (existing) {
      return existing;
    }
    const vote: RefundVote = { id: `refund_vote_${nextId++}`, poolId, userId, createdAt: new Date() };
    this.votes.push(vote);
    return vote;
  }

  async find(poolId: string, userId: string): Promise<RefundVote | null> {
    return this.votes.find((v) => v.poolId === poolId && v.userId === userId) ?? null;
  }

  async listByPool(poolId: string): Promise<RefundVote[]> {
    return this.votes.filter((v) => v.poolId === poolId);
  }
}
