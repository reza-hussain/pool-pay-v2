// Manual on-demand check for "does PAN identity verification actually work
// against Cashfree right now" — same pattern as verify-upi.ts. Calls
// Cashfree's /pan endpoint directly and prints the real response/error,
// bypassing verifyFullIdentity's caller-side handling.
//
// Usage: npm run verify-pan -- <PAN> <name>
//   e.g. npm run verify-pan -- ABCDE1234A "Test User"
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { CashfreeClient, CashfreeApiError } from "../src/payments/cashfree/client.js";
import { env } from "../src/lib/env.js";

async function main() {
  const pan = process.argv[2];
  const name = process.argv[3];
  if (!pan || !name) {
    console.error('Usage: npm run verify-pan -- <PAN> "<name>"');
    process.exit(1);
  }

  const client = new CashfreeClient({
    product: "verification",
    env: env.CASHFREE_ENV,
    clientId: env.CASHFREE_VERIFICATION_CLIENT_ID,
    clientSecret: env.CASHFREE_VERIFICATION_CLIENT_SECRET,
    publicKey: env.CASHFREE_VERIFICATION_PUBLIC_KEY,
  });

  const verificationId = `kyc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  console.log(`Verifying PAN "${pan}" / name "${name}" against Cashfree (${env.CASHFREE_ENV})...`);
  try {
    const response = await client.post("/pan", { verification_id: verificationId, pan, name });
    console.log("Raw response:", response);
  } catch (error) {
    if (error instanceof CashfreeApiError) {
      console.error(`✗ Cashfree API error — code: ${error.code ?? "(none)"}, message: ${error.message}`);
    } else {
      console.error("✗ Unexpected error (not a Cashfree API error):", error);
    }
    process.exit(1);
  }
}

main();
