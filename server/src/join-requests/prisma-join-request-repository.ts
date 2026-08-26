import type { PrismaClient } from "@prisma/client";
import {
  JoinRequestNotPendingError,
  type CreateJoinRequestData,
  type JoinRequest,
  type JoinRequestRepository,
  type JoinRequestState,
} from "./types.js";

export class PrismaJoinRequestRepository implements JoinRequestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateJoinRequestData): Promise<JoinRequest> {
    const row = await this.prisma.joinRequest.create({
      data: { poolId: data.poolId, requesterUserId: data.requesterUserId },
    });
    return toJoinRequest(row);
  }

  async findById(id: string): Promise<JoinRequest | null> {
    const row = await this.prisma.joinRequest.findUnique({ where: { id } });
    return row ? toJoinRequest(row) : null;
  }

  async findLatestByPoolAndRequester(poolId: string, requesterUserId: string): Promise<JoinRequest | null> {
    const row = await this.prisma.joinRequest.findFirst({
      where: { poolId, requesterUserId },
      orderBy: { createdAt: "desc" },
    });
    return row ? toJoinRequest(row) : null;
  }

  async listPendingByPool(poolId: string): Promise<JoinRequest[]> {
    const rows = await this.prisma.joinRequest.findMany({
      where: { poolId, state: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toJoinRequest);
  }

  async approve(id: string): Promise<JoinRequest> {
    return this.decide(id, "APPROVED");
  }

  async reject(id: string): Promise<JoinRequest> {
    return this.decide(id, "REJECTED");
  }

  private async decide(id: string, state: "APPROVED" | "REJECTED"): Promise<JoinRequest> {
    // Conditional on state, same race guard as Invitation.markCancelled — a
    // concurrent decision between the service's pre-check and this write
    // can't be silently clobbered.
    const result = await this.prisma.joinRequest.updateMany({
      where: { id, state: "PENDING" },
      data: { state, decidedAt: new Date() },
    });
    if (result.count === 0) {
      throw new JoinRequestNotPendingError();
    }
    const row = await this.prisma.joinRequest.findUniqueOrThrow({ where: { id } });
    return toJoinRequest(row);
  }
}

function toJoinRequest(row: {
  id: string;
  poolId: string;
  requesterUserId: string;
  state: string;
  createdAt: Date;
  decidedAt: Date | null;
}): JoinRequest {
  return { ...row, state: row.state as JoinRequestState };
}
