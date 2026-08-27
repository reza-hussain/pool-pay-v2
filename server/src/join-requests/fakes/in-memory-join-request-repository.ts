import {
  JoinRequestNotPendingError,
  type CreateJoinRequestData,
  type JoinRequest,
  type JoinRequestRepository,
} from "../types.js";

let nextId = 1;

export class InMemoryJoinRequestRepository implements JoinRequestRepository {
  joinRequests: JoinRequest[] = [];

  async create(data: CreateJoinRequestData): Promise<JoinRequest> {
    const joinRequest: JoinRequest = {
      id: `join_request_${nextId++}`,
      poolId: data.poolId,
      requesterUserId: data.requesterUserId,
      state: "PENDING",
      createdAt: new Date(),
      decidedAt: null,
    };
    this.joinRequests.push(joinRequest);
    return joinRequest;
  }

  async findById(id: string): Promise<JoinRequest | null> {
    return this.joinRequests.find((r) => r.id === id) ?? null;
  }

  async findLatestByPoolAndRequester(poolId: string, requesterUserId: string): Promise<JoinRequest | null> {
    const matches = this.joinRequests
      .filter((r) => r.poolId === poolId && r.requesterUserId === requesterUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async listPendingByPool(poolId: string): Promise<JoinRequest[]> {
    return this.joinRequests
      .filter((r) => r.poolId === poolId && r.state === "PENDING")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async approve(id: string): Promise<JoinRequest> {
    return this.decide(id, "APPROVED");
  }

  async reject(id: string): Promise<JoinRequest> {
    return this.decide(id, "REJECTED");
  }

  private decide(id: string, state: "APPROVED" | "REJECTED"): JoinRequest {
    const joinRequest = this.joinRequests.find((r) => r.id === id);
    if (!joinRequest) {
      throw new Error(`JoinRequest ${id} not found`);
    }
    if (joinRequest.state !== "PENDING") {
      throw new JoinRequestNotPendingError();
    }
    joinRequest.state = state;
    joinRequest.decidedAt = new Date();
    return joinRequest;
  }
}
