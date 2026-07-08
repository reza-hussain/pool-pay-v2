# Partner with a Banking-as-a-Service provider instead of obtaining our own money-transmitter license

Given the custodial money model ([0001](./0001-custodial-money-model.md)), we need a licensed entity to actually hold funds. Obtaining an independent money-transmitter license is prohibitively expensive and slow for a new company. Instead, we will partner with a Banking-as-a-Service (BaaS) provider that holds the license and FBO (for-benefit-of) accounts, while Pool Pay is the software/UX layer handling KYC orchestration and ledgering on top.

Because Pool Pay also targets India-only v1 scope built on UPI ([0003](./0003-india-only-upi-scope.md)), the BaaS partner must specifically be an Indian bank plus a UPI-enabled PSP (e.g. Setu, Decentro, Cashfree, M2P) — not a global provider like Stripe, which has no UPI capability.
