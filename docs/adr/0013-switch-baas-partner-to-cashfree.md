# Switch BaaS/UPI partner from Decentro to Cashfree

[0002](./0002-baas-partnership.md) named Cashfree alongside Decentro as an acceptable Indian BaaS/UPI-PSP partner, and ticket #14 built the real adapter against Decentro first. Decentro never provisioned us a `consumer_urn` — the merchant/consumer identifier every payments-v3 call requires — so the Decentro integration was unable to move past the fake providers in practice. We're switching to Cashfree, which we do have working credentials for.

This replaces `DecentroPaymentProvider`/`DecentroIdentityProvider` with `CashfreePaymentProvider`/`CashfreeIdentityProvider` behind the same `PaymentProvider`/`IdentityVerificationProvider` seams ([0002](./0002-baas-partnership.md)) — no consumer of those interfaces (DepositService, SpendService, ReimbursementService, ClosureService, AuthService) changed.

## Shape differences absorbed inside the new adapter

- **Collections**: Decentro's Dynamic QR was a single call that returned a scannable QR image. Cashfree's Orders API only creates an order; a second, unauthenticated "headless Order Pay" call (`POST /orders/sessions`, keyed by `payment_session_id`) is needed to get a base64 UPI QR image back.
- **Payouts**: Decentro's payout was one inline call with beneficiary details attached. Cashfree Payouts is beneficiary-based — a beneficiary must be registered once (reused via a VPA-derived deterministic ID) before a Standard Transfer can target it.
- **Credentials**: Decentro used one client-id/secret pair across its payments and KYC modules. Cashfree issues separate credential pairs per product (Payment Gateway, Payouts, Verification Suite) — `env.ts` now gates the payment adapter and identity adapter on different credential sets (`hasCashfreePaymentCredentials` / `hasCashfreeIdentityCredentials`).
- **Webhook auth**: Decentro's callback auth scheme was never confirmed against real sandbox traffic, so ticket #15 shipped a placeholder shared-secret header check. Cashfree's webhook signing is documented (HMAC-SHA256 over the raw body, `x-webhook-signature`/`x-webhook-timestamp`), so this switch also replaces the placeholder with a real signature check — `PaymentProvider` gained a `verifyWebhookSignature` method for this, and `app.ts` now captures the raw request body so the exact signed bytes are available to check against.

## Consequences

- `DECENTRO_*` env vars are gone; replaced by `CASHFREE_ENV` and per-product `CASHFREE_PG_*` / `CASHFREE_PAYOUT_*` / `CASHFREE_VERIFICATION_*` credential pairs, plus `CASHFREE_VIRTUAL_VPA` (see `.env.example`).
- The deposit webhook route moved from `/webhooks/decentro/deposits` to `/webhooks/cashfree/deposits`.
- Several exact Cashfree response field names (the UPI penny-drop account-holder-name field, the duplicate-beneficiary error code, whether Payment Gateway webhooks share the exact same signature scheme as Verification Suite's documented one) weren't confirmed against a live sandbox call during this switch — flagged inline in `cashfree-payment-provider.ts` the same way the Decentro adapter flagged its own unverified assumptions, to revisit once sandbox access confirms them.
