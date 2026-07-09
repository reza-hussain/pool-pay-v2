import type { OtpChallenge, OtpStore } from "../types.js";

let nextId = 1;

export class InMemoryOtpStore implements OtpStore {
  private byId = new Map<string, OtpChallenge>();

  async create(phoneNumber: string, code: string, expiresAt: Date): Promise<OtpChallenge> {
    const challenge: OtpChallenge = {
      id: `otp_${nextId++}`,
      phoneNumber,
      code,
      expiresAt,
      consumedAt: null,
    };
    this.byId.set(challenge.id, challenge);
    return challenge;
  }

  async findById(id: string): Promise<OtpChallenge | null> {
    return this.byId.get(id) ?? null;
  }

  async markConsumed(id: string): Promise<void> {
    const challenge = this.byId.get(id);
    if (!challenge) return;
    challenge.consumedAt = new Date();
  }
}
