// The seam for full-KYC verification (ticket #12 stubbed this; ticket #14
// wires up a real check), mirroring how PaymentProvider seams off the real
// UPI/BaaS partner. A real check needs an actual identity document; the fake
// (ticket #12) never did, since it always passed instantly.
export interface IdentityVerificationResult {
  verified: boolean;
  providerRef: string;
}

export interface IdentityVerificationProvider {
  verifyFullIdentity(userId: string, panNumber: string): Promise<IdentityVerificationResult>;
}

export class InvalidPanNumberError extends Error {
  constructor() {
    super("A valid PAN is required for identity verification");
    this.name = "InvalidPanNumberError";
  }
}
