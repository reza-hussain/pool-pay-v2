import type { PrismaClient } from "@prisma/client";
import type { User, UserRepository } from "./types.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(phoneNumber: string): Promise<User> {
    return this.prisma.user.create({ data: { phoneNumber } });
  }

  async markFullyVerified(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isVerified: true } });
  }

  async subscribe(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isSubscribed: true } });
  }
}
