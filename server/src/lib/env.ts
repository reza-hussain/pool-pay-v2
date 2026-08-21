import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.string().default("3000"),
  // Real BaaS/UPI partner (ADR 0002/0005/0013) — all optional. When unset,
  // index.ts falls back to the fake Payment Provider and identity
  // verification stub used by every other ticket's tests. Vendor: Cashfree
  // (ADR 0013 — replaced Decentro, which never provisioned us a
  // consumer_urn). Unlike Decentro's single shared client_id/secret pair,
  // Cashfree issues separate credentials per product: Payment Gateway
  // (collections), Payouts (transfers), and Verification Suite (UPI/bank
  // verification + PAN KYC) are independent dashboard apps.
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CASHFREE_PG_CLIENT_ID: z.string().optional(),
  CASHFREE_PG_CLIENT_SECRET: z.string().optional(),
  CASHFREE_PAYOUT_CLIENT_ID: z.string().optional(),
  CASHFREE_PAYOUT_CLIENT_SECRET: z.string().optional(),
  // Also backs identity verification (PAN KYC) — both live under Cashfree's
  // Verification Suite product, sharing one credential pair.
  CASHFREE_VERIFICATION_CLIENT_ID: z.string().optional(),
  CASHFREE_VERIFICATION_CLIENT_SECRET: z.string().optional(),
  // Secure ID's Public Key 2FA (docs.cashfree.com/secure-id) — this dev
  // environment's egress IP isn't whitelisted for Verification Suite, so
  // without this every /upi/penny-drop and /pan call is rejected outright.
  // Optional: unset falls back to relying on IP whitelisting alone.
  CASHFREE_VERIFICATION_PUBLIC_KEY: z.string().optional(),
  // The Pool Pay merchant's own registered UPI ID — fixed per account, not
  // generated per transaction. Shown to Members as "Pay to UPI ID" alongside
  // the per-transaction QR (see CashfreePaymentProvider).
  CASHFREE_VIRTUAL_VPA: z.string().optional(),
});

export const env = envSchema.parse(process.env);

// Gates CashfreeIdentityProvider — only needs Verification Suite credentials.
export const hasCashfreeIdentityCredentials = Boolean(
  env.CASHFREE_VERIFICATION_CLIENT_ID && env.CASHFREE_VERIFICATION_CLIENT_SECRET,
);

// Gates CashfreePaymentProvider — needs all three product credential pairs
// (pg for collections, payout for transfers, verification for verifyVpa)
// plus the merchant's display VPA.
export const hasCashfreePaymentCredentials = Boolean(
  env.CASHFREE_PG_CLIENT_ID &&
    env.CASHFREE_PG_CLIENT_SECRET &&
    env.CASHFREE_PAYOUT_CLIENT_ID &&
    env.CASHFREE_PAYOUT_CLIENT_SECRET &&
    env.CASHFREE_VERIFICATION_CLIENT_ID &&
    env.CASHFREE_VERIFICATION_CLIENT_SECRET &&
    env.CASHFREE_VIRTUAL_VPA,
);
