import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.string().default("3000"),
  // Real BaaS/UPI partner (ticket #14, ADR 0002/0005) — all optional. When
  // unset, index.ts falls back to the fake Payment Provider and identity
  // verification stub used by every other ticket's tests. Vendor: Decentro.
  DECENTRO_CLIENT_ID: z.string().optional(),
  DECENTRO_CLIENT_SECRET: z.string().optional(),
  DECENTRO_ENV: z.enum(["staging", "production"]).default("staging"),
  // The Pool Pay merchant/virtual account's own UPI VPA — fixed per account,
  // not generated per transaction. Shown to Members as "Pay to UPI ID"
  // alongside the per-transaction QR (see DecentroPaymentProvider).
  DECENTRO_VIRTUAL_VPA: z.string().optional(),
  // Decentro's "consumer_urn" — a merchant/consumer identifier Decentro
  // assigns during onboarding, required on every payments-v3 call.
  DECENTRO_CONSUMER_URN: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const hasDecentroCredentials = Boolean(
  env.DECENTRO_CLIENT_ID && env.DECENTRO_CLIENT_SECRET && env.DECENTRO_CONSUMER_URN,
);
