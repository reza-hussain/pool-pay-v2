import type { PrismaClient } from "@prisma/client";
import type { UpiOwnershipConfirmation, UpiOwnershipConfirmationRepository } from "./types.js";

export class PrismaUpiOwnershipConfirmationRepository implements UpiOwnershipConfirmationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, upiId: string, providerRef: string, createdAt: Date): Promise<UpiOwnershipConfirmation> {
    const row = await this.prisma.upiOwnershipConfirmation.create({
      data: { userId, upiId, providerRef, createdAt },
    });
    return toConfirmation(row);
  }

  async findById(id: string): Promise<UpiOwnershipConfirmation | null> {
    const row = await this.prisma.upiOwnershipConfirmation.findUnique({ where: { id } });
    return row ? toConfirmation(row) : null;
  }

  async findByProviderRef(providerRef: string): Promise<UpiOwnershipConfirmation | null> {
    const row = await this.prisma.upiOwnershipConfirmation.findUnique({ where: { providerRef } });
    return row ? toConfirmation(row) : null;
  }

  async markConfirmed(providerRef: string): Promise<void> {
    await this.prisma.upiOwnershipConfirmation.update({
      where: { providerRef },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  }

  async markFailed(providerRef: string): Promise<void> {
    await this.prisma.upiOwnershipConfirmation.update({
      where: { providerRef },
      data: { status: "FAILED" },
    });
  }

  async findLatestConfirmed(userId: string, upiId: string): Promise<UpiOwnershipConfirmation | null> {
    const row = await this.prisma.upiOwnershipConfirmation.findFirst({
      where: { userId, upiId, status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
    });
    return row ? toConfirmation(row) : null;
  }
}

function toConfirmation(row: {
  id: string;
  userId: string;
  upiId: string;
  providerRef: string;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
}): UpiOwnershipConfirmation {
  return { ...row, status: row.status as UpiOwnershipConfirmation["status"] };
}
