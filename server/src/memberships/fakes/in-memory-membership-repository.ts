import type { Membership, MembershipRepository, MembershipRole } from "../types.js";

let nextId = 1;

export class InMemoryMembershipRepository implements MembershipRepository {
  memberships: Membership[] = [];

  async create(poolId: string, userId: string, role: MembershipRole): Promise<Membership> {
    const membership: Membership = {
      id: `membership_${nextId++}`,
      poolId,
      userId,
      role,
      joinedAt: new Date(),
    };
    this.memberships.push(membership);
    return membership;
  }

  async find(poolId: string, userId: string): Promise<Membership | null> {
    return (
      this.memberships.find((m) => m.poolId === poolId && m.userId === userId) ?? null
    );
  }

  async listByPool(poolId: string): Promise<Membership[]> {
    return this.memberships.filter((m) => m.poolId === poolId);
  }
}
