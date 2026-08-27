import type { PrismaClient } from "@prisma/client";
import {
  InvitationNotCancellableError,
  type CreateInvitationData,
  type Invitation,
  type InvitationRepository,
  type InvitationState,
} from "./types.js";

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

  async markExpired(id: string): Promise<Invitation> {
    const row = await this.prisma.invitation.update({
      where: { id },
      data: { state: "EXPIRED" },
    });
    return toInvitation(row);
  }

  async markCancelled(id: string): Promise<Invitation> {
    // Conditional on state so a payment confirming concurrently (PENDING ->
    // PAID) between the service's pre-check and this write can't have its
    // result silently clobbered back to CANCELLED.
    const result = await this.prisma.invitation.updateMany({
      where: { id, state: "PENDING" },
      data: { state: "CANCELLED" },
    });
    if (result.count === 0) {
      throw new InvitationNotCancellableError();
    }
    const row = await this.prisma.invitation.findUniqueOrThrow({ where: { id } });
    return toInvitation(row);
  }

  async findById(id: string): Promise<Invitation | null> {
    const row = await this.prisma.invitation.findUnique({ where: { id } });
    return row ? toInvitation(row) : null;
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

  async findByToken(token: string): Promise<Invitation | null> {
    const row = await this.prisma.invitation.findUnique({ where: { token } });
    return row ? toInvitation(row) : null;
  }
}

function toInvitation(row: {
  id: string;
  poolId: string;
  inviteeUserId: string;
  assignedAmountPaise: number | null;
  state: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  paidAt: Date | null;
}): Invitation {
  return { ...row, state: row.state as InvitationState };
}
