import type { Membership, MembershipRepository, MembershipRole } from "../types.js";

let nextId = 1;

export class InMemoryMembershipRepository implements MembershipRepository {
  memberships: Membership[] = [];

  async create(poolId: string, userId: string, role: MembershipRole): Promise<Membership> {
    const existing = this.memberships.find((m) => m.poolId === poolId && m.userId === userId);
    if (existing) {
      existing.role = role;
      existing.removedAt = null;
      return existing;
    }
    const membership: Membership = {
      id: `membership_${nextId++}`,
      poolId,
      userId,
      role,
      joinedAt: new Date(),
      removedAt: null,
    };
    this.memberships.push(membership);
    return membership;
  }

  async find(poolId: string, userId: string): Promise<Membership | null> {
    return (
      this.memberships.find(
        (m) => m.poolId === poolId && m.userId === userId && m.removedAt === null,
      ) ?? null
    );
  }

  async listByPool(poolId: string): Promise<Membership[]> {
    return this.memberships.filter((m) => m.poolId === poolId && m.removedAt === null);
  }

  async remove(poolId: string, userId: string): Promise<void> {
    const membership = this.memberships.find((m) => m.poolId === poolId && m.userId === userId);
    if (membership) {
      membership.removedAt = new Date();
    }
  }
}
