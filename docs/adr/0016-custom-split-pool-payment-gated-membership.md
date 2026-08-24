# Custom Split Pool: payment gates Membership

> **Note:** the "Organizer isn't exempt" mechanic below is accurate in spirit but overstates itself — read alongside [ADR-0017](0017-organizer-payment-gate-extended-to-all-pools.md), which restates the actual mechanics (the Pool is created immediately; payment gates the Organizer's Membership and ability to invite, not the Pool's existence) and extends the same gate to Equal Split Pools, superseding this file's "Equal Split Pools are unaffected" Consequences bullet below.

Pool Pay's original "Open Pool" — freeform contributions, no fixed amount, contribute whenever — was retired because it didn't fit the app's goal of being structured rather than chaotic. It's replaced by **Custom Split Pool**, where the Organizer assigns each Member their own fixed share.

For a Custom Split Pool, joining and paying are the same act: a Member does not exist until they pay their assigned share in full via UPI. The Organizer sends an **Invitation** (in-app notification and/or a phone-number-locked link) carrying the assigned amount; there is no separate "join now, pay later" step, unlike Equal Split Pools, where Invite Link/Pool Code joining is immediate and the Deposit happens afterward.

This is a deliberate trade-off toward structure over flexibility. The Organizer already knows what each Member is expected to contribute — agreed outside the app before the Invitation is sent — so nothing is gained by letting someone become a Member without committing money, and it closes the enforcement gap Equal Split still has today, where a Deposit is never actually checked against the amount a Member owes.

The Organizer isn't exempt from this: they set and pay their own assigned share as part of *creating* the Pool, before inviting anyone else. This keeps "Organizer" and "paid Member" the same invariant for every participant, themselves included, rather than carving out a special case where the Organizer is a Member without ever having paid in.

## Considered Options

- **Join first, assign/pay a share later.** Rejected — reopens the "chaotic, whatever-they-want" problem this pool type exists to solve, and creates a window where someone is a Member with no money on the line.

## Consequences

- ~~Equal Split Pools are unaffected: Invite Link/Pool Code joining stays immediate~~ — **superseded by ADR-0017**: the Organizer's own share on an Equal Split Pool is now gated the same way, before *other* Members can be invited via Invite Link/Pool Code. Deposits from other Members remain unenforced against the expected share. Equal Split also now picks up the "ongoing" use case (apartment/roommate expenses) that Open Pool used to serve — a Member there isn't limited to a single Deposit, so repeat top-ups over time work today without any schema change.
- "Open Pool" is retired as a concept; the Custom Split Pool that replaces it means something entirely different (fixed, individually-assigned, locked amounts — not freeform ones). See `CONTEXT.md`.
- Locking a Custom Split Pool voids any Invitation still pending and unpaid at that moment, not just new ones — same as an explicit cancel. An unpaid Invitation is a deferred Deposit, and letting one complete after Locking would inject money that the Pool's Locked-state totals (fully-funded progress, pro-rata refund shares at Closure) never accounted for.
- Existing Pools already created with the old `OPEN` type keep whatever money is already in them but go read-only going forward: no further Deposits accepted, though the Organizer can still Close them for a pro-rata refund (ADR-0006). They are not force-closed or migrated as part of this change.
- ADR-0006 (pool closure) needs its "Open Pool" references updated to match — done alongside this ADR.
