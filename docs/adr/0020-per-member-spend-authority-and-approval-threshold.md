# Per-Member spend authority, capped by a majority-approval threshold

Supersedes [ADR-0004](0004-single-organizer-authority.md) (single-Organizer spending authority). That trade-off — trust one person completely with pooled money — broke down against real scenarios where every Member needs to be able to pay for shared things (fuel, a hotel room) directly out of their own stake in the Pool, not just the Organizer.

We now give every Member spend authority from the Pool, not just the Organizer. But unconstrained per-Member spending reopens ADR-0004's trust concern in a sharper form: a spend triggers a real, live UPI transfer immediately, before the cost is divided up (see [ADR-0021](0021-equal-split-spend-mechanics.md)). A Member who deposited ₹10,000 into a ₹50,000 Pool could unilaterally record and execute a ₹50,000 transfer to any destination, and only afterward would the equal-split math attribute a share of that cost back to everyone — by which point the money is already gone and cannot be recalled.

To close that gap without reintroducing the "every spend needs sign-off" friction ADR-0004 deliberately avoided, spending splits into two tiers based purely on amount:

- A spend at or below what the recorder has left in their own remaining balance (see [ADR-0022](0022-per-member-balance-refund-formula.md)) fires immediately, no approval needed — it's just spending your own money.
- A spend larger than the recorder's own remaining balance requires approval from **more than half of the Pool's currently active Members** before the transfer executes. Applies identically to Equal Split and Custom Split Pools.

We rejected trying to distinguish "legitimate shared spend" from "personal misuse" automatically (e.g. by category or merchant) — the app has no reliable signal for whether a large transfer benefits the whole group or just the recorder (the same limitation shows up in the refund-adjustment case, ADR-0022). A blunt amount-vs-balance threshold is mechanically enforceable without judging intent.

We also rejected making this threshold optional per-Pool. Given the real money at stake, it's mandatory for every Pool, with no opt-out.

The threshold is a **share of currently active Members** (more than half), not a fixed headcount fixed at Pool creation — a fixed number chosen while the group was larger could become impossible to satisfy, or effectively "everyone must agree," once Members leave.
