import type { IdentityVerificationProvider, IdentityVerificationResult } from "../identity-provider.js";

let nextId = 1;

// Used everywhere until ticket #14's DecentroIdentityProvider is configured
// (see hasDecentroCredentials in lib/env.ts) — passes instantly, no real
// document check, matching ticket #12's original stub behavior exactly.
export class FakeIdentityProvider implements IdentityVerificationProvider {
  async verifyFullIdentity(_userId: string, _panNumber: string): Promise<IdentityVerificationResult> {
    return { verified: true, providerRef: `fake_kyc_${nextId++}` };
  }
}
