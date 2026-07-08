# India-only v1 scope, built on UPI

Pool Pay must support UPI (scan-and-pay from a QR code, FamPay-style) as a core feature. UPI is India's domestic real-time payment network run by NPCI and has no equivalent outside India — there is no way to offer it as "one rail among several" in a multi-country v1 without massively multiplying regulatory and integration surface. We chose to scope v1 to **India-only** (INR, UPI, RBI-regulated), treating multi-country support with UPI as one of several rails as an explicit future phase.

This decision drives the BaaS partner choice ([0002](./0002-baas-partnership.md)) and the payout mechanism ([0005](./0005-upi-only-payout.md)).
