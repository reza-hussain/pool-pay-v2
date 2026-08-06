import type { UpiOwnershipConfirmation, UpiOwnershipConfirmationRepository } from "../types.js";

let nextId = 1;

export class InMemoryUpiOwnershipConfirmationRepository implements UpiOwnershipConfirmationRepository {
  private byId = new Map<string, UpiOwnershipConfirmation>();
  private byProviderRef = new Map<string, UpiOwnershipConfirmation>();

  async create(userId: string, upiId: string, providerRef: string, createdAt: Date): Promise<UpiOwnershipConfirmation> {
    const confirmation: UpiOwnershipConfirmation = {
      id: `upi_ownership_${nextId++}`,
      userId,
      upiId,
      providerRef,
      status: "PENDING",
      createdAt,
      confirmedAt: null,
    };
    this.byId.set(confirmation.id, confirmation);
    this.byProviderRef.set(providerRef, confirmation);
    return confirmation;
  }

  async findById(id: string): Promise<UpiOwnershipConfirmation | null> {
    return this.byId.get(id) ?? null;
  }

  async findByProviderRef(providerRef: string): Promise<UpiOwnershipConfirmation | null> {
    return this.byProviderRef.get(providerRef) ?? null;
  }

  async markConfirmed(providerRef: string): Promise<void> {
    const confirmation = this.byProviderRef.get(providerRef);
    if (!confirmation) {
      throw new Error(`Unknown UPI ownership providerRef: ${providerRef}`);
    }
    confirmation.status = "CONFIRMED";
    confirmation.confirmedAt = new Date();
  }

  async markFailed(providerRef: string): Promise<void> {
    const confirmation = this.byProviderRef.get(providerRef);
    if (!confirmation) {
      throw new Error(`Unknown UPI ownership providerRef: ${providerRef}`);
    }
    confirmation.status = "FAILED";
  }

  async findLatestConfirmed(userId: string, upiId: string): Promise<UpiOwnershipConfirmation | null> {
    let latest: UpiOwnershipConfirmation | null = null;
    for (const confirmation of this.byId.values()) {
      if (confirmation.userId !== userId || confirmation.upiId !== upiId || confirmation.status !== "CONFIRMED") {
        continue;
      }
      if (!latest || confirmation.createdAt.getTime() > latest.createdAt.getTime()) {
        latest = confirmation;
      }
    }
    return latest;
  }
}
