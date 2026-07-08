# Pool Pay — MVP Spec

## Problem Statement

Groups of people who need to share money for a while — friends on a trip, people splitting an event's cost, roommates covering apartment expenses — currently manage this with a messy mix of spreadsheets, WhatsApp reminders, and manual UPI transfers. There's no shared source of truth for who's paid what, no visibility into what the money was actually spent on, and no fair way to handle leftover money at the end. Trusting one person to hold and spend the group's cash is common in practice, but today it's informal and has no safety net if that trust breaks down.

## Solution

Pool Pay lets a group create a **Pool** — a shared, real money fund for a bounded purpose (a trip, an event) or an ongoing one (an apartment) — that actually holds deposited money rather than just tracking IOUs. Members join with a link or code and pay in via UPI, exactly like paying any shop. One Member, the **Organizer**, spends directly from the Pool by scanning a merchant's UPI QR code, or pays back a Member who fronted a cost. Every deposit and every spend is visible to everyone in real time, so the group can trust the Organizer without needing to approve every purchase — and if that trust ever breaks down, the rest of the group can outvote the Organizer and get their money back. When the Pool's purpose is served, whatever's left is split back fairly, in proportion to what each person put in.

v1 is India-only, built entirely on UPI.

## User Stories

**Creating a Pool**
1. As a user, I want to create a new Pool, so that I can start collecting money from my group for a trip, event, or shared apartment expenses.
2. As an Organizer, I want to choose between an Equal Split Pool (fixed amount per person) or an Open Pool (any amount, anytime), so that the Pool matches how my group actually wants to contribute.
3. As an Organizer creating an Equal Split Pool, I want to set the per-person amount, so that every Member knows exactly what they owe.

**Joining a Pool**
4. As a user, I want to receive an invite link to a Pool, so that I can join with one tap.
5. As a user, I want to join a Pool by entering a six-digit code, so that I can join even when a link isn't convenient to share.
6. As a user, I want joining a Pool to not require the Organizer's approval, so that I can start contributing right away.

**Depositing**
7. As a Member of an Equal Split Pool, I want to scan a QR code with my required amount already filled in, so that I don't have to type the right amount myself.
8. As a Member of an Open Pool, I want to scan a QR code and enter whatever amount I choose, so that I can contribute flexibly.
9. As a Member, I want to deposit using UPI, so that I can pay with the app I already use every day.
10. As a Member whose UPI app let me edit a pre-filled Equal Split amount, I want my payment to still go through and be tracked as a shortfall or overage rather than rejected, so that my money is never stuck in limbo over a mismatched amount.

**Locking a Pool**
11. As an Organizer, I want to lock a Pool at any time, so that no further deposits come in once I've decided we have enough.
12. As an Organizer, I want to fund an entire Pool myself and then lock it, so that I can treat my group without requiring anyone else to pay.
13. As a Member, I want to be unable to deposit into a Locked Pool, so that the app doesn't let me attempt a payment that shouldn't happen.

**Spending**
14. As an Organizer, I want to scan a merchant's UPI QR code and pay directly from the Pool balance, so that I can cover group expenses without fronting the money myself.
15. As an Organizer, I want to send a UPI transfer to reimburse a Member who paid for something out of pocket, so that people who front costs get paid back quickly.
16. As an Organizer, I want to be prevented from spending more than the Pool's current balance, so that I can't accidentally spend money that isn't there.
17. As any Member, I want every spend to show up immediately in a shared transaction ledger (merchant, amount, who authorized it), so that I can trust how the group's money is being used.

**Protecting the group's money**
18. As a non-Organizer Member, I want to vote to force an early refund of the Pool, so that I have protection if I stop trusting the Organizer, or the Organizer goes unreachable.
19. As a non-Organizer Member, I want a refund vote to pass with a simple majority of non-Organizer Members (not everyone), so that one unresponsive person can't block the group's ability to protect itself.
20. As a Member, I want my vote to count the same as everyone else's regardless of how much I've deposited, so that voting power isn't skewed by who paid more.
21. As a Member, I want a successful vote to immediately close the Pool and refund whatever balance remains, so that the group's money doesn't stay stuck indefinitely.
22. As a Member, I want it to be clear that a refund vote can't recover money the Organizer already spent before the vote, so my expectations of what the vote can undo are set correctly.

**Closing and refunds**
23. As an Organizer, I want to manually close a Pool once it's served its purpose, so that leftover money gets returned to everyone.
24. As a Member, I want any leftover balance refunded to me in proportion to what I actually deposited (not split evenly), so the refund is fair regardless of how much everyone chipped in.
25. As a Member, I want my refund paid out via UPI, so that I get my money back the same way I put it in.
26. As a Member who was removed from a Pool before it closed, I want my prior deposits still refunded to me pro-rata when the Pool eventually closes, so I'm not penalized just for being removed.

**Identity and trust**
27. As a prospective Organizer, I want to complete full identity verification before I can create a Pool, so the app and its banking partner can trust me with custody of the group's money.
28. As a Member making casual deposits, I want only light verification (e.g. phone number), so I can contribute to a quick group expense without a heavyweight signup.

**Paying for the app**
29. As a user, I want depositing money into a Pool to be completely free, so contributing to a group fund never feels like it's being taxed.
30. As a user, I want getting my refund back to be completely free, so I'm never charged to receive my own money.
31. As an Organizer, I want a small fee applied only when I spend from the Pool, so I understand exactly what I'm being charged for and why.
32. As an Organizer who runs multiple Pools regularly, I want a subscription that removes per-spend fees and any limit on how many Pools I can run, so heavy usage doesn't cost me per transaction.
33. As a subscriber, I want cross-Pool analytics (aggregate spending, category breakdowns, exportable reports), so I can track my overall usage across all my Pools.
34. As any Member, subscriber or not, I want free access to the full transaction ledger of any Pool I'm part of, so basic transparency into my own money is never paywalled.

**Scope**
35. As a user in India, I want every money movement in Pool Pay to run over UPI, so I don't need to learn a new payment system.
36. As the business, we serve India-only in v1 (INR, UPI, RBI-regulated identity/banking rules), so we can launch without needing multi-country regulatory infrastructure.

## Implementation Decisions

**Testing seam:** a single **Payment Provider** interface sits between Pool Pay's own logic and the external UPI/BaaS partner. Everything Pool Pay owns is tested above this line, against a fake; only a thin adapter below it talks to the real partner. See Testing Decisions.

**Core modules:**
- **Pool Service** — owns the Pool's lifecycle: creation (Equal Split with a target amount, or Open), adding/removing Members, Locking, Closing, and pro-rata refund calculation. This is the heart of the system and has no direct dependency on any payment vendor's SDK — only on the Payment Provider interface below.
- **Payment Provider interface** (the seam) — the one boundary between Pool Pay and the outside world for money movement. It covers: generating a Pool's UPI QR (fixed-amount for Equal Split, open-amount for Open), receiving deposit-confirmation callbacks, initiating a Spend to a merchant, and initiating a transfer for a reimbursement or a refund. The real implementation wraps whichever BaaS/UPI partner is selected (Setu, Decentro, Cashfree, M2P, or a direct sponsor bank — vendor not yet chosen); a fake implementation backs all other tests.
- **Membership/Invite module** — generates and resolves Invite Links and six-digit Pool Codes into an open Pool join (no Organizer approval step).
- **Identity/KYC module** — full KYC (via the BaaS partner's KYC flow) gates becoming an Organizer; light verification (phone OTP) gates becoming a Member.
- **Ledger** — a real-time, per-Pool view of every Deposit and Spend, visible to every Member, always free regardless of subscription status.
- **Voting module** — tallies one-Member-one-vote refund votes among non-Organizer Members; triggers immediate Closure (reusing the Pool Service's normal Closure/refund path) once a simple majority is reached.
- **Billing/Subscription module** — applies the per-Spend fee for non-subscribers, tracks subscription status, waives the fee and lifts the Pool-count limit for subscribers, and gates access to cross-Pool analytics.

**Data model, at a decision level (not a schema):**
- **Pool**: type (Equal Split | Open), per-person target amount (Equal Split only), state (Active | Locked | Closed), Organizer reference.
- **Member**: Pool-scoped role (Organizer | Member), verification tier, running total deposited.
- **Deposit**: amount, Member, timestamp; for Equal Split, tracks expected-vs-actual to record shortfall/overage rather than rejecting mismatched amounts.
- **Spend**: amount, merchant/recipient, fee applied (Spends only, never Deposits or Refunds).
- **RefundVote**: one record per voting Member per Pool; a simple majority of non-Organizer Members triggers Closure.
- **ClosureRefund**: per-Member payout record, calculated pro-rata against total contributions, paid out via UPI.

**Behavioral rules carried over directly from the design's ADRs** (see `docs/adr/0001`–`0011` for full reasoning):
- Real money is custodied by Pool Pay via a BaaS/UPI-enabled partner, not tracked as IOUs (ADR 0001, 0002).
- v1 is India-only; every payment operation assumes UPI (ADR 0003).
- The Organizer has sole day-to-day spending authority over the full Pool balance — never capped to only their own deposit (ADR 0004, 0009).
- There is no generic "withdraw to bank account" operation — UPI transfers (to a merchant, or to a Member's UPI ID) are the only way money leaves a Pool (ADR 0005).
- Pools never auto-expire by date; only a manual Organizer Close or a successful refund vote ends one (ADR 0006).
- A Member removed from a Pool is not instantly refunded — they're refunded pro-rata at the eventual Closure like everyone else (ADR 0006).

## Testing Decisions

- Good tests here exercise the Pool Service's external behavior — create a Pool, deposit, lock, spend, vote, close — and assert on the resulting balance, ledger, and refund amounts. They should not assert on internal function calls or implementation details.
- Nearly all logic (contribution tracking, locking, spend-limit enforcement, vote-threshold math, pro-rata refund calculation, fee application) is tested against a **fake Payment Provider** — an in-memory stand-in for the real UPI/BaaS adapter. This makes the suite fast, deterministic, and independent of any external sandbox.
- The fake should support both the happy path (a deposit is confirmed instantly) and the edge cases that matter for money correctness: an Equal Split deposit arriving at the wrong amount, a Spend attempted beyond the current balance, a vote landing exactly at the majority threshold versus one short, and a Member being removed mid-Pool before eventual Closure.
- A small, separate suite of contract tests verifies the real adapter against the chosen BaaS partner's sandbox. These are kept out of the main fast suite since they depend on external, possibly rate-limited or flaky infrastructure.
- There's no prior art in this codebase yet (it's a new build), but the approach — test business logic against a fake at its external boundary, verify the real adapter separately — is standard practice for money-movement systems specifically because a live payment network can't be tested fast or deterministically.

## Out of Scope

- Multi-country support or non-UPI payment rails (explicit future phase, ADR 0003).
- Multiple Organizers per Pool, or an approval workflow for day-to-day spending.
- Instant refund on Member removal (considered and rejected — adds a second pro-rata calculation for no clear benefit, see ADR 0006).
- Card issuing (virtual or physical debit cards tied to a Pool).
- Interest/float income treatment on idle Pool balances — flagged during design as unresolved, not decided.
- Notifications and reminders (e.g. nudging Members who haven't paid their Equal Split share).
- Auto-expiry of a Pool by date (rejected, ADR 0006).
- Any partial/individual early exit outside the majority-vote mechanism.
- Pool Pay obtaining its own money-transmitter license (rejected, ADR 0002).
- Vote weighting by contribution amount (rejected — one-Member-one-vote only, ADR 0009).
- Fees on Deposits or Refunds (rejected — fee applies to Spends only, ADR 0010).
- Paywalling basic per-Pool ledger visibility (rejected, ADR 0011).

## Further Notes

- No issue tracker was configured at the time this spec was written; it's saved locally at `docs/spec-mvp.md` rather than published. Once a tracker is set up (via `/setup-matt-pocock-skills`), this should be migrated there with the `ready-for-agent` label applied.
- The specific BaaS/UPI PSP vendor (Setu, Decentro, Cashfree, M2P, or a direct sponsor bank) has not been selected. That's a vendor evaluation task that should happen before the real Payment Provider adapter is built — it doesn't block building and testing everything above the Payment Provider seam.
- `CONTEXT.md` and `docs/adr/0001`–`0011` contain the full domain glossary and decision reasoning behind this spec and should be treated as authoritative background for anyone implementing it.
