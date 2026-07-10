import "dotenv/config";
import { describe, expect, it } from "vitest";
import { env, hasDecentroCredentials } from "../src/lib/env.js";
import { DecentroPaymentProvider } from "../src/payments/decentro/decentro-payment-provider.js";

// Hits Decentro's real staging sandbox — run via `npm run test:contract`
// with DECENTRO_CLIENT_ID/DECENTRO_CLIENT_SECRET/DECENTRO_CONSUMER_URN/
// DECENTRO_VIRTUAL_VPA set. Skips itself (not a failure) when unset, so this
// suite is safe to leave in CI without live credentials configured.
describe.skipIf(!hasDecentroCredentials)("DecentroPaymentProvider (contract)", () => {
  function makeProvider() {
    return new DecentroPaymentProvider({
      clientId: env.DECENTRO_CLIENT_ID!,
      clientSecret: env.DECENTRO_CLIENT_SECRET!,
      env: env.DECENTRO_ENV,
      consumerUrn: env.DECENTRO_CONSUMER_URN!,
      virtualVpa: env.DECENTRO_VIRTUAL_VPA!,
    });
  }

  it("creates a Dynamic QR deposit intent for a fixed amount", async () => {
    const provider = makeProvider();

    const intent = await provider.createDepositIntent("contract-test-pool", 100000);

    expect(intent.qrImageUrl).toMatch(/^https?:\/\//);
    expect(intent.vpa).toBe(env.DECENTRO_VIRTUAL_VPA);
  });

  it("creates a Dynamic QR deposit intent for an Open Pool (no fixed amount)", async () => {
    const provider = makeProvider();

    const intent = await provider.createDepositIntent("contract-test-pool", null);

    expect(intent.qrImageUrl).toMatch(/^https?:\/\//);
  });

  it("initiates a UPI payout for a Spend", async () => {
    const provider = makeProvider();

    // Decentro's staging sandbox accepts test UPI handles per its testing
    // credentials docs — swap for whatever your sandbox account documents.
    const confirmation = await provider.initiateSpend("contract-test-pool", "success@decentro", 10000);

    expect(confirmation.id).toBeTruthy();
  });

  it("initiates a UPI payout for a reimbursement/refund transfer", async () => {
    const provider = makeProvider();

    const confirmation = await provider.initiateTransfer("contract-test-pool", "success@decentro", 10000);

    expect(confirmation.id).toBeTruthy();
  });
});
