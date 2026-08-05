// The seam for full-KYC verification (ticket #12 stubbed this; ticket #14
// wires up a real check), mirroring how PaymentProvider seams off the real
// UPI/BaaS partner. A real check needs an actual identity document; the fake
// (ticket #12) never did, since it always passed instantly.
export interface IdentityVerificationResult {
  verified: boolean;
  providerRef: string;
}

export interface IdentityVerificationProvider {
  // name is the person's own on-file profile name (ADR 0012's Onboarding
  // profile) — real providers check the PAN's registered name against it,
  // so identity verification can't be satisfied with someone else's PAN.
  verifyFullIdentity(userId: string, panNumber: string, name: string): Promise<IdentityVerificationResult>;
}

export class InvalidPanNumberError extends Error {
  constructor() {
    super("A valid PAN is required for identity verification");
    this.name = "InvalidPanNumberError";
  }
}
