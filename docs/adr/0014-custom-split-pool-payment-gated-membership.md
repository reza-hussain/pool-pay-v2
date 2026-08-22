# Custom Split Pool: payment gates Membership

Pool Pay's original "Open Pool" — freeform contributions, no fixed amount, contribute whenever — was retired because it didn't fit the app's goal of being structured rather than chaotic. It's replaced by **Custom Split Pool**, where the Organizer assigns each Member their own fixed share.

For a Custom Split Pool, joining and paying are the same act: a Member does not exist until they pay their assigned share in full via UPI. The Organizer sends an **Invitation** (in-app notification and/or a phone-number-locked link) carrying the assigned amount; there is no separate "join now, pay later" step, unlike Equal Split Pools, where Invite Link/Pool Code joining is immediate and the Deposit happens afterward.

This is a deliberate trade-off toward structure over flexibility. The Organizer already knows what each Member is expected to contribute — agreed outside the app before the Invitation is sent — so nothing is gained by letting someone become a Member without committing money, and it closes the enforcement gap Equal Split still has today, where a Deposit is never actually checked against the amount a Member owes.

## Considered Options

- **Join first, assign/pay a share later.** Rejected — reopens the "chaotic, whatever-they-want" problem this pool type exists to solve, and creates a window where someone is a Member with no money on the line.

## Consequences

- Equal Split Pools are unaffected: Invite Link/Pool Code joining stays immediate, and Deposits there remain unenforced against the expected share.
- "Open Pool" is retired as a concept; the Custom Split Pool that replaces it means something entirely different (fixed, individually-assigned, locked amounts — not freeform ones). See `CONTEXT.md`.
