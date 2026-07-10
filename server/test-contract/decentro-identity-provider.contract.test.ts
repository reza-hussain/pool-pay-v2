import "dotenv/config";
import { describe, expect, it } from "vitest";
import { env, hasDecentroCredentials } from "../src/lib/env.js";
import { DecentroIdentityProvider } from "../src/auth/decentro-identity-provider.js";
import { InvalidPanNumberError } from "../src/auth/identity-provider.js";

// Hits Decentro's real staging sandbox — run via `npm run test:contract`.
// Skips itself (not a failure) when DECENTRO_* env vars are unset.
describe.skipIf(!hasDecentroCredentials)("DecentroIdentityProvider (contract)", () => {
  function makeProvider() {
    return new DecentroIdentityProvider({
      clientId: env.DECENTRO_CLIENT_ID!,
      clientSecret: env.DECENTRO_CLIENT_SECRET!,
      env: env.DECENTRO_ENV,
    });
  }

  it("verifies a PAN against the CKYC registry", async () => {
    const provider = makeProvider();

    // Decentro's staging sandbox documents specific test PAN values that
    // return deterministic SUCCESS/FAILURE — swap for whatever your sandbox
    // account's testing-credentials page lists.
    const result = await provider.verifyFullIdentity("contract-test-user", "ABCDE1234A");

    expect(typeof result.verified).toBe("boolean");
    expect(result.providerRef).toBeTruthy();
  });

  it("rejects a malformed PAN before calling out to Decentro", async () => {
    const provider = makeProvider();

    await expect(provider.verifyFullIdentity("contract-test-user", "not-a-pan")).rejects.toThrow(
      InvalidPanNumberError,
    );
  });
});
