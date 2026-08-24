import type { PrismaClient } from "@prisma/client";
import type { CreateInvitationData, Invitation, InvitationRepository, InvitationState } from "./types.js";

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateInvitationData): Promise<Invitation> {
    const row = await this.prisma.invitation.create({
      data: {
        poolId: data.poolId,
        inviteeUserId: data.inviteeUserId,
        assignedAmountPaise: data.assignedAmountPaise,
        token: data.token,
        expiresAt: data.expiresAt,
      },
    });
    return toInvitation(row);
  }

  async findPendingByPoolAndInvitee(poolId: string, inviteeUserId: string): Promise<Invitation | null> {
    const row = await this.prisma.invitation.findFirst({
      where: { poolId, inviteeUserId, state: "PENDING" },
    });
    return row ? toInvitation(row) : null;
  }

  async markPaid(id: string): Promise<Invitation> {
    const row = await this.prisma.invitation.update({
      where: { id },
      data: { state: "PAID", paidAt: new Date() },
    });
    return toInvitation(row);
  }

  async listPendingByInvitee(userId: string): Promise<Invitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { inviteeUserId: userId, state: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toInvitation);
  }

  async listByPool(poolId: string): Promise<Invitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { poolId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toInvitation);
  }
}

function toInvitation(row: {
  id: string;
  poolId: string;
  inviteeUserId: string;
  assignedAmountPaise: number;
  state: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  paidAt: Date | null;
}): Invitation {
  return { ...row, state: row.state as InvitationState };
}
