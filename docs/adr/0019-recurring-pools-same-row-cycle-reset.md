# Recurring Pools: same-row cycle reset with lazy rollover

Equal Split Pools already serve ongoing use cases through repeat Deposits (CONTEXT.md, replacing the retired Open Pool), but there's no notion of a *period* — no way to routinely re-target the per-person amount for a new billing cycle (e.g. this month's rent share) short of running the one-off Top-up Request flow (ADR-0018) by hand, every cycle, forever. That flow is built for an occasional mid-cycle bump, not for routine periodic re-targeting, and it's increase-only, which doesn't fit a rent share that might also need to go *down*. This ADR adds a **Recurring Pool**: an Equal Split or Custom Split Pool that resets itself into a new **Cycle** on a fixed period.

## Decision

1. **Opt-in at creation only.** The Organizer chooses Weekly, Monthly, or Custom (every N weeks/months) when creating the Pool. This is permanent — a Pool can't become Recurring later, or stop being Recurring while staying open (see point 8).
2. **Same Pool row, reset in place.** A new Cycle does not create a new Pool. The Pool keeps its id, join code, and Membership list across every Cycle — Members don't re-join each period.
3. **Rollover is lazy**, matching this codebase's existing no-cron convention (ADR-0017's 24-hour expiry check, `OtpRequest.expiresAt`): once the configured period has elapsed, the next time anyone opens the Pool, the Organizer is prompted to start the new Cycle and set its amount — any value, up or down, defaulting to the last Cycle's amount. Nothing runs in the background.
4. **Starting a new Cycle auto-cancels any Top-up Request still `PENDING`** from the Cycle that just ended, rather than blocking rollover on it — each auto-cancellation is recorded as a `TOP_UP_WAIVED` Ledger entry per ADR-0018. This is deliberately more permissive than re-Locking, which still requires every Top-up Request resolved first.
5. **Money-movement history is retained across Cycles**, each Deposit/Spend/Reimbursement/Refund tagged with the Cycle it belongs to, so a Member can see who paid what in which Cycle for the Pool's whole life.
6. **Leftover balance rolls forward** into the next Cycle's starting balance — it is not refunded. This is a deliberate departure from Closure's pro-rata refund (ADR-0006): a Recurring Pool's Cycles are checkpoints in one ongoing fund, not independent financial events the way a one-off Pool's Closure is.
7. **A shortfall in one Cycle does not carry into the next Cycle's target.** Each Cycle's expected amount stands alone; a Member who fell short simply shows that in that Cycle's history.
8. **Ending a Recurring Pool for good reuses Close unchanged** — organizer-only, pro-rata refund of whatever's left in the current Cycle (ADR-0006). There is no separate "stop recurring" action; Close is the only way a Recurring Pool's life ends.

## Considered Options

- **A new Pool row per Cycle, linked by a series id.** Would have reused Closure's refund logic unchanged and kept every Cycle an independently auditable Pool. Rejected — it means rebuilding the join code and re-adding every Member each period, which doesn't match how people actually think about a running apartment fund.
- **Fully automatic, cron-driven rollover.** Rejected for the same reason ADR-0017 rejected scheduled expiry: no scheduled-job infrastructure exists in this codebase, and nothing about the exact rollover instant is time-sensitive enough to need one.
- **Refund leftover pro-rata at every Cycle boundary, reusing Closure.** Rejected — it would force Members to re-deposit their own rolled-over money every Cycle for no benefit; Closure's refund is for a Pool's actual end-of-life, not a routine checkpoint.
- **Carry shortfalls forward as compounding debt.** Rejected — Equal Split already runs with no hard enforcement of the per-person amount (a Deposit is recorded, never rejected, even if it doesn't match); layering in cross-cycle debt tracking adds an obligation this app doesn't enforce anywhere else, for a case the Organizer can already see and chase down manually via Cycle history.

## Consequences

- `Pool` gains cycle-tracking fields it doesn't have today: a period, a next-rollover anchor date, and a current Cycle number.
- `Deposit`, `Spend`, `Reimbursement`, and `Refund` all need a Cycle identifier — a Recurring Pool's row no longer represents one terminal financial life the way Closure's pro-rata math assumes elsewhere.
- Depends on ADR-0018's Top-up Request and `TOP_UP_WAIVED` Ledger entry for point 4 — implement 0018 first.
- CONTEXT.md gains **Recurring Pool** and **Cycle** entries; the **Equal Split Pool** entry's mention of repeat Deposits covering "ongoing/recurring use cases" should point to Cycle as the more precise mechanism now available for anyone who wants a period, without implying plain repeat Deposits without one stop being valid.
