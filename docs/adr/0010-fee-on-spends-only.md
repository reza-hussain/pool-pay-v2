# Monetize via a fee on Spends only, not Deposits or Refunds

Pool Pay charges a per-transaction fee only on **Spends** (the Organizer paying a merchant via UPI QR from the Pool balance). Deposits (Members paying into a Pool) and Refunds (money paid back out on Closure, including via the majority-vote emergency refund, [0009](./0009-majority-vote-emergency-refund.md)) are fee-free.

This was a deliberate choice, not an oversight: P2P UPI has always been culturally and functionally free in India, and a Deposit *feels* like paying a friend back, not buying a service — charging on that moment (or on getting one's own money back via Refund) risks feeling like nickel-and-diming and pushing users back to cash or manual UPI + Splitwise. A Spend, by contrast, is tied to an actual service Pool Pay provides (letting an Organizer spend pooled money on behalf of a group, with transparency/audit trail), making it the more defensible place to monetize.
