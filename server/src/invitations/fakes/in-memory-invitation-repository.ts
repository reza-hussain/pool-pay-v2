import type { CreateInvitationData, Invitation, InvitationRepository } from "../types.js";

let nextId = 1;

export class InMemoryInvitationRepository implements InvitationRepository {
  invitations: Invitation[] = [];

  async create(data: CreateInvitationData): Promise<Invitation> {
    const invitation: Invitation = {
      id: `invitation_${nextId++}`,
      poolId: data.poolId,
      inviteeUserId: data.inviteeUserId,
      assignedAmountPaise: data.assignedAmountPaise,
      state: "PENDING",
      token: data.token,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      paidAt: null,
    };
    this.invitations.push(invitation);
    return invitation;
  }

  async findPendingByPoolAndInvitee(poolId: string, inviteeUserId: string): Promise<Invitation | null> {
    return (
      this.invitations.find(
        (i) => i.poolId === poolId && i.inviteeUserId === inviteeUserId && i.state === "PENDING",
      ) ?? null
    );
  }

  async markPaid(id: string): Promise<Invitation> {
    const invitation = this.invitations.find((i) => i.id === id);
    if (!invitation) {
      throw new Error(`Invitation ${id} not found`);
    }
    invitation.state = "PAID";
    invitation.paidAt = new Date();
    return invitation;
  }

  async markExpired(id: string): Promise<Invitation> {
    const invitation = this.invitations.find((i) => i.id === id);
    if (!invitation) {
      throw new Error(`Invitation ${id} not found`);
    }
    invitation.state = "EXPIRED";
    return invitation;
  }

  async markCancelled(id: string): Promise<Invitation> {
    const invitation = this.invitations.find((i) => i.id === id);
    if (!invitation) {
      throw new Error(`Invitation ${id} not found`);
    }
    invitation.state = "CANCELLED";
    return invitation;
  }

  async findById(id: string): Promise<Invitation | null> {
    return this.invitations.find((i) => i.id === id) ?? null;
  }

  async listPendingByInvitee(userId: string): Promise<Invitation[]> {
    return this.invitations
      .filter((i) => i.inviteeUserId === userId && i.state === "PENDING")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listByPool(poolId: string): Promise<Invitation[]> {
    return this.invitations
      .filter((i) => i.poolId === poolId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
