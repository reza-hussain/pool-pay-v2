# Mid-cycle amount increases via Top-up Request

CONTEXT.md's **Deposit** entry currently says the per-person amount is "fixed and locked" once a Pool starts collecting — there's no way to raise it after Members have already deposited. Two real scenarios need one: a group-gift Pool where the Organizer decides, after everyone's already paid, that ₹2000 a head isn't enough; and an ongoing apartment-expenses Pool where the monthly share needs to go up. This ADR introduces a **Top-up Request** — a new way for the Organizer to ask already-contributing Members for more, without touching the "every Member owes the same amount" invariant that defines Equal Split, or the payment-gated-membership invariant Custom Split relies on (ADR-0016).

## Decision

1. **Scope**: Equal Split and Custom Split Pools only — not Open Pool, which is retired and has no fixed-amount concept to raise. Applies whether the Pool is Active or Locked.
2. **Requesting a top-up is the only way to unlock a Locked Pool.** There is no standalone "Unlock" action. Tapping "Increase Amount" on a Locked Pool shows the Organizer a confirmation ("You need to unlock the Pool to do this") before proceeding; declining leaves the Pool Locked. This is the first and only case in which a Locked Pool can accept new Deposits again.
3. **The Organizer enters an additional amount, not a new total** — "collect ₹2000 more per person," not "new amount: ₹4000." For Equal Split, one uniform delta is requested from every current Member at once. For Custom Split, the Organizer edits each Member's requested delta individually, consistent with Custom Split already assigning amounts per Member.
4. **Mechanism**: each affected Member gets one Top-up Request — a small state machine, `PENDING → PAID | CANCELLED`, plus a notification. Paying one settles as an ordinary Deposit; no new money-movement type is needed, and it's tagged to the Pool's current cycle if the Pool is Recurring (see the companion ADR on Recurring Pools).
5. **Pool-wide freeze**: while any Top-up Request in a Pool is `PENDING`, Spend and Reimbursement — the only two ways money leaves a Pool (ADR-0005) — are blocked for the whole Pool, not just for the Members who still owe. This protects the Pool's balance from being spent down before the raised target is actually collected.
6. **Cancelling**: for Custom Split, the Organizer cancels one Member's Top-up Request individually — that Member is excused, permanently, at their old amount. For Equal Split, cancelling reverts every outstanding Top-up Request in the Pool at once — there's no partial cancel, because excusing one Member while holding the rest to the new amount would break Equal Split's defining invariant. Every cancellation is recorded as a new zero-amount Ledger entry ("Top-up Request Waived") so the Pool's history shows what was asked for and waived, not just what was paid.
7. **Re-Locking a Pool is blocked while any Top-up Request is still `PENDING`** — the Organizer must collect or cancel every one first.
8. **Top-up Requests never auto-expire.** Unlike the Organizer's own join-payment Invitation (ADR-0017's 24-hour expiry), an unpaid Top-up Request only blocks Spend/Reimbursement pool-wide — it doesn't shut the requestee out of the Pool itself — so there's no forcing function pushing toward a deadline.

## Considered Options

- **Reuse the existing Invitation entity for top-ups.** Rejected — Invitation's job is specifically "become a Member on payment" (ADR-0016); a top-up's whole premise is that the recipient is *already* a Member, so reusing Invitation would mean special-casing out membership creation rather than modeling something genuinely different.
- **Relax Custom Split's post-join deposit block and let a top-up settle as a plain repeat Deposit**, no formal request. Rejected — this would silently reopen a block ADR-0016 put there deliberately, and leave no record of what was actually asked for, from whom, or when.
- **Per-Member cancel for Equal Split too.** Rejected in favor of an all-or-nothing pool-wide cancel, to keep "every Member owes the same amount" true for Equal Split at all times.
- **Auto-expiry matching the 24-hour Invitation pattern.** Rejected — an unpaid top-up doesn't block the requestee from the Pool the way an unpaid initial share does, so there's no equivalent urgency.

## Consequences

- CONTEXT.md's **Deposit** entry ("the amount is fixed and locked") needs updating — the target can now increase mid-life via a Top-up Request. **Locked** needs a note about this one narrow unlock path. Both are addressed alongside this ADR.
- `SpendService` and `ReimbursementService` each need a new precondition: block on any `PENDING` Top-up Request in the Pool.
- Ledger gains a new entry type, `TOP_UP_WAIVED` (zero-amount), alongside the existing `DEPOSIT | SPEND | REIMBURSEMENT | REFUND`.
- Notification gains a new type for "Top-up Requested."
- `PoolService.lockPool` needs a precondition: reject if any `PENDING` Top-up Request exists.
