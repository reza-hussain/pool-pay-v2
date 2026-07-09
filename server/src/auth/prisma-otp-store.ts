import type { PrismaClient } from "@prisma/client";
import type { OtpChallenge, OtpStore } from "./types.js";

export class PrismaOtpStore implements OtpStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(phoneNumber: string, code: string, expiresAt: Date): Promise<OtpChallenge> {
    return this.prisma.otpRequest.create({
      data: { phoneNumber, code, expiresAt },
    });
  }

  async findById(id: string): Promise<OtpChallenge | null> {
    return this.prisma.otpRequest.findUnique({ where: { id } });
  }

  async markConsumed(id: string): Promise<void> {
    await this.prisma.otpRequest.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }
}
