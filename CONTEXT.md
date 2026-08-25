# Pool Pay

A custodial shared-payments app: groups of users deposit real money into a shared, time-boxed fund and spend from it together — for trips, events, or ongoing apartment/roommate expenses.

## Language

**Pool**:
A shared fund that a group of Members deposit money into and spend from together, for a bounded purpose (a trip, an event) or an ongoing purpose (an apartment). Holds real custodied money, not just a tracked balance.
_Avoid_: Mini-bank, pot, fund, jar

**Organizer**:
The Member who created a Pool and holds sole authority to spend or transfer money out of it. Exactly one per Pool in v1. Pool creation itself is never blocked on payment — the Organizer lands on the Pool's Dashboard immediately — but for every Pool type, the Organizer must pay their own share before they can invite anyone else; until then the Dashboard is in the locked Awaiting Payment state (see **Awaiting Payment**). This keeps "Organizer" and "paid Member" the same invariant for everyone, including themselves (ADR-0016, ADR-0017).
_Avoid_: Admin, owner (of the Pool itself — the Pool is not owned, it's organized)

**Member**:
A person who has joined a Pool and can contribute to it. Distinct from the Organizer, who is also a Member but with additional spending authority.
_Avoid_: User (too generic — "Member" is scoped to a specific Pool)

**Onboarding**:
The one-time, mandatory flow a person completes before reaching Home: phone/OTP verification, then profile setup (name, email, date of birth, Registered UPI ID, optional photo). Someone who already has a session never sees it again. The mobile client blocks every Pool-related screen (joining, depositing, etc.) until Onboarding — including the Registered UPI ID — is complete, so a Member the server processes is expected to always have a Registered UPI ID on file. Code should treat a Member missing one as an error condition, not a case to silently degrade around.
_Avoid_: Signup (too narrow — Signup is only the phone/OTP step within Onboarding)

**Invite Link / Pool Code**:
The two ways a person joins an Equal Split Pool as a Member: an open shareable link, or a six-digit code entered manually. Anyone holding either can join — no Organizer approval step — since every Member owes the same known amount, so there's nothing to assign per-person. Custom Split Pools do not use this mechanism; see **Invitation**.
_Avoid_: Invite code (ambiguous between the two mechanisms — use the full term)

**Equal Split Pool**:
A Pool where the Organizer sets a fixed per-person contribution amount, and every Member is expected to contribute exactly that share. Unlike Custom Split, a Member isn't limited to one Deposit — repeat Deposits over time are how an Equal Split Pool now covers ongoing use cases (e.g. apartment/roommate expenses), the role the retired Open Pool used to serve. For a use case with an actual period (e.g. rent due monthly), see **Recurring Pool** and **Cycle** — plain repeat Deposits without a period remain valid too.
_Avoid_: Fixed pool

**Custom Split Pool**:
A Pool where the Organizer assigns each Member their own fixed contribution amount individually, rather than one amount applying to everyone (contrast Equal Split Pool). A Member must pay their assigned amount in full via UPI before they become a Member — an Invitation and its first Deposit together are how someone joins; there is no separate join-then-pay-later step. That Deposit is also their only one: a Custom Split Pool Member cannot make further Deposits after joining, unlike an Equal Split Pool Member.
_Avoid_: Open pool (a separate, now-retired Pool type — see below), Flexible pool, ongoing pool

**Invitation**:
The Organizer's request for one specific, already-registered person (looked up by phone number) to join a Custom Split Pool, carrying the fixed amount the Organizer has assigned them. Delivered as an in-app notification and/or a shareable link — but unlike Invite Link/Pool Code, this link is bound to that one phone number: opening it while signed in as anyone else fails with an invalid-invite error. Becomes a Membership only once the invitee pays the assigned amount in full. The Organizer can cancel a pending Invitation any time before payment (no in-place editing — cancel and send a new one instead); the Organizer also picks an expiry duration from presets, after which an unpaid Invitation lapses exactly as if cancelled. Sending new Invitations is blocked while the Pool is Locked, and Locking the Pool also voids any Invitation still pending at that moment, the same as a cancel — an unpaid Invitation is a deferred Deposit, and letting one complete after Locking would inject money the Pool's Locked-state totals never accounted for.

The same entity also backs the Organizer's own first share, self-addressed at Pool creation, for every Pool type (not just Custom Split — see ADR-0017). That self-Invitation isn't sent anywhere and can't be cancelled by choice, but it expires the same way: 24 hours after creation, unpaid, it lapses and the Pool moves to Expired (see **Awaiting Payment**).
_Avoid_: Invite (too generic — collides with Invite Link/Pool Code, a different mechanism)

**Awaiting Payment** (Pool state):
The Dashboard state a Pool is in from the moment it's created until its Organizer pays their own share (see **Organizer**, **Invitation**). Add Members and every other invite action (Invite Link, Pool Code, sending a Custom Split Invitation) are disabled while a Pool is Awaiting Payment. Paying unlocks the Dashboard for good — a Pool never returns to Awaiting Payment once unlocked. If the Organizer's self-Invitation expires unpaid (24 hours), the Pool becomes Expired instead: terminal, no further Deposits, kept (not deleted) for audit, distinct from Closed (which implies money was collected and is being refunded pro-rata) (ADR-0017).
_Avoid_: Pending, Draft (this is specifically the pre-Organizer-payment lock, not a general in-progress state)

**Open Pool**:
A Pool with no fixed contribution amount — Members contribute whatever they want, whenever they want. The Pool balance is simply the running sum of contributions. Retired (ticket #59) in favor of Custom Split Pool (individually assigned, enforced amounts) and Equal Split Pool with repeat Deposits (the ongoing/recurring use case): no longer offered on the create-Pool screen, and an existing Open Pool no longer accepts new Deposits — it stays fully readable and can still be Closed for its pro-rata refund.
_Avoid_: Flexible pool, ongoing pool

**Locked** (Pool state):
A Pool state, set only by the Organizer, in which no Member (including the Organizer) can make further deposits. Applies to both Equal Split and Custom Split Pools. Lets an Organizer fully fund a Pool alone and shut out further contributions, or simply stop collection once a Pool has enough. For a Custom Split Pool, Locking also blocks sending any new invites and voids any Invitation still pending — an invite is a promise of a future Deposit, so it doesn't make sense to leave that open, or let one still resolve, while blocking the Deposit itself. The only way to unlock a Locked Pool again is by requesting a **Top-up Request** — there is no standalone Unlock action (ADR-0018). Re-Locking is blocked while any Top-up Request is still unpaid.
_Avoid_: Closed (reserved for the Pool's end-of-life state, a separate concept)

**Deposit**:
Money a Member pays into a Pool via UPI. For an Equal Split Pool, the amount is fixed, equal to the Member's required share, carried by the Pool's QR code. For a Custom Split Pool, the amount is likewise fixed, but equal to that specific Member's individually assigned share rather than a pool-wide amount. That required share isn't permanently fixed for the Pool's whole life, though — see **Top-up Request** for how the Organizer can raise it mid-life, and **Cycle** for how a Recurring Pool re-sets it each period.
_Avoid_: Contribution (used loosely elsewhere in this doc before this term was sharpened — treat as synonym, but prefer "Deposit" going forward), payment-in

**Top-up Request**:
The Organizer's request for an already-contributing Member to deposit an additional amount, on top of what they've already paid — how the Organizer raises a Pool's required share mid-life (e.g. deciding ₹2000 a head wasn't enough, after everyone's already paid). One Top-up Request per Member, tracked `PENDING → PAID | CANCELLED`; paying one is just an ordinary Deposit. For an Equal Split Pool, the Organizer sets one delta requested from every Member at once. For a Custom Split Pool, the Organizer sets a different delta per Member. While any Top-up Request in a Pool is `PENDING`, no Spend or Reimbursement can happen anywhere in that Pool. Cancelling one is called *waiving* it: for Custom Split, the Organizer waives one Member's Top-up Request individually, excusing them permanently at their old amount; for Equal Split, waiving reverts every outstanding Top-up Request in the Pool at once, since Equal Split requires every Member to owe the same amount at all times (ADR-0018).
_Avoid_: Top-up (ambiguous between the request and the resulting Deposit — use "Top-up Request" for the ask, "Deposit" for the money that settles it)

**Recurring Pool**:
An Equal Split or Custom Split Pool that resets itself into a new **Cycle** on a fixed period (Weekly, Monthly, or Custom) instead of running as one open-ended fund. Chosen once, at creation — a Pool can't become Recurring later, or stop being Recurring without being Closed for good. The Pool itself never re-creates: it keeps the same id, join code, and Membership list across every Cycle (ADR-0019).
_Avoid_: Subscription pool, ongoing pool (see **Equal Split Pool** — an ongoing Pool doesn't have to be Recurring)

**Cycle**:
One period's round of collection within a Recurring Pool — e.g. one month's rent. The Organizer sets each Cycle's per-person amount when it starts (any value, up or down, defaulting to the last Cycle's amount); rollover to the next Cycle happens lazily, the next time anyone opens the Pool after the period has elapsed, and starting a new Cycle auto-waives any Top-up Request still pending from the one before. A Cycle's leftover balance rolls forward into the next Cycle rather than being refunded, and a Member's shortfall in one Cycle doesn't carry into the next Cycle's target — both stand alone, visible only in that Cycle's history (ADR-0019).
_Avoid_: Period, round, billing cycle (use "Cycle" — it's this Pool's own term, not a generic billing concept)

**Registered UPI ID**:
The UPI ID a person provides once, during Onboarding, stored on their account as the default destination for money leaving a Pool to them — refunds and reimbursements. Distinct from whatever UPI ID or app a Member happens to pay *from* when making a Deposit, which Pool Pay never captures or stores.
_Avoid_: VPA (the underlying technical identifier; use "Registered UPI ID" for the stored-on-account concept)

**Closed** (Pool state):
The Pool's end-of-life state, set only by the Organizer (no automatic expiry by date). On closing, any leftover balance is refunded pro-rata to Members via UPI, proportional to each Member's total contributions.
_Avoid_: Locked (a separate, earlier state — a Pool can be Locked without being Closed)
