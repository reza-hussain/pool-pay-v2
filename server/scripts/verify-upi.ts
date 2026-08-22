// Manual on-demand check for "does Registered UPI ID verification actually
// work against Cashfree right now" — run this instead of finding out via a
// failed onboarding attempt. Calls Cashfree's penny-drop endpoint directly
// and prints the real response/error, bypassing verifyVpa's catch (which by
// design, per ADR 0012, folds every CashfreeApiError into a plain "not
// verified" so onboarding can't distinguish a bad VPA from a broken
// integration). That's the right UX for onboarding and the wrong one for
// debugging, which is what this script is for.
//
// Usage: npm run verify-upi -- <vpa>
//   e.g. npm run verify-upi -- testsuccess@gocash
import "dotenv/config";
import { CashfreeClient, CashfreeApiError } from "../src/payments/cashfree/client.js";
import { env } from "../src/lib/env.js";

async function main() {
  const vpa = process.argv[2];
  if (!vpa) {
    console.error("Usage: npm run verify-upi -- <vpa>");
    process.exit(1);
  }

  if (!env.CASHFREE_VERIFICATION_CLIENT_ID || !env.CASHFREE_VERIFICATION_CLIENT_SECRET) {
    console.error("CASHFREE_VERIFICATION_CLIENT_ID / CASHFREE_VERIFICATION_CLIENT_SECRET not set in server/.env");
    process.exit(1);
  }
  if (!env.CASHFREE_VERIFICATION_PUBLIC_KEY) {
    console.warn(
      "Warning: CASHFREE_VERIFICATION_PUBLIC_KEY is not set — requests will go out without the Secure ID " +
        "2FA signature. Unless this environment's egress IP is whitelisted on the Cashfree dashboard, every " +
        "call will fail.",
    );
  }

  const client = new CashfreeClient({
    product: "verification",
    env: env.CASHFREE_ENV,
    clientId: env.CASHFREE_VERIFICATION_CLIENT_ID,
    clientSecret: env.CASHFREE_VERIFICATION_CLIENT_SECRET,
    publicKey: env.CASHFREE_VERIFICATION_PUBLIC_KEY,
  });

  console.log(`Verifying "${vpa}" against Cashfree (${env.CASHFREE_ENV})...`);
  try {
    const response = await client.post<{ status?: string; name_at_bank?: string }>("/upi/penny-drop", {
      verification_id: `vpa_${Date.now()}`,
      vpa,
      user_consent: {
        obtained: true,
        type: "EXPLICIT",
        timestamp: new Date().toISOString(),
        purpose: "Pool Pay UPI ID verification",
      },
    });
    console.log("Raw response:", response);
    if (response.status === "VALID") {
      console.log(`✓ VERIFIED — account holder: ${response.name_at_bank ?? "(name not returned)"}`);
    } else {
      console.log(`✗ NOT VERIFIED — Cashfree returned status "${response.status}" (not "VALID")`);
    }
  } catch (error) {
    if (error instanceof CashfreeApiError) {
      console.error(`✗ Cashfree API error — code: ${error.code ?? "(none)"}, message: ${error.message}`);
      if (error.code === "signature_mismatch" || /signature/i.test(error.message)) {
        console.error(
          "\nThis is a Secure ID 2FA signature failure — the public key in CASHFREE_VERIFICATION_PUBLIC_KEY " +
            "doesn't match what Cashfree has on file for this client-id. Re-download the current Test/Sandbox " +
            "Verification Suite public key from the Cashfree dashboard (Developers → Two-Factor Authentication) " +
            "and replace it in server/.env — this is not a code bug.",
        );
      }
    } else {
      console.error("✗ Unexpected error (not a Cashfree API error):", error);
    }
    process.exit(1);
  }
}

main();
