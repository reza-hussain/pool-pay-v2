# Custodial money model, not ledger-only

We considered two shapes for Pool Pay: a ledger-only app (like early Splitwise) that tracks who-owes-whom while money moves peer-to-peer outside the app, versus a custodial app that actually holds Members' deposited money. We chose **custodial** — the app itself holds real money in a Pool, matching the "mini-bank" concept and enabling direct spend (UPI scan-and-pay) from the Pool balance.

This is a foundational, hard-to-reverse choice: it pulls in money-transmitter regulation, KYC/AML obligations, and dependency on a banking/payments partner (see [0002](./0002-baas-partnership.md)), none of which a ledger-only app would need.
