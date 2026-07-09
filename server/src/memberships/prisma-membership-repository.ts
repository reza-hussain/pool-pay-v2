import type { PrismaClient } from "@prisma/client";
import type { Membership, MembershipRepository, MembershipRole } from "./types.js";

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(poolId: string, userId: string, role: MembershipRole): Promise<Membership> {
    const row = await this.prisma.membership.create({ data: { poolId, userId, role } });
    return toMembership(row);
  }

  async find(poolId: string, userId: string): Promise<Membership | null> {
    const row = await this.prisma.membership.findUnique({
      where: { poolId_userId: { poolId, userId } },
    });
    return row ? toMembership(row) : null;
  }

  async listByPool(poolId: string): Promise<Membership[]> {
    const rows = await this.prisma.membership.findMany({ where: { poolId } });
    return rows.map(toMembership);
  }
}

function toMembership(row: {
  id: string;
  poolId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}): Membership {
  return { ...row, role: row.role as MembershipRole };
}
