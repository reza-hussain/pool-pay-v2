# Redesign Pool Detail and All Members; add User Detail and a shared Transaction Detail screen

Reached via a `/grilling` session over a hand-drawn wireframe covering three screens reachable by tapping a Pool: Pool Detail, "All Members," and a member-profile screen. A fourth screen, Transaction Detail, emerged during the session as a necessary consequence of the other three and was scoped alongside them. All decisions below were confirmed one-by-one during that session, not left tentative.

## Decision

### 1. Pool Detail (`mobile/src/screens/PoolDetailScreen.tsx`, full redesign)

- The two-stat row (Members count / per-person amount) is replaced by a single "Total Balance" card.
- A member avatar strip (avatars + "+" to add a Member, reusing the existing invite flow, + "View all") replaces however Members are currently surfaced, and "View all" navigates to All Members.
- A real filter + search bar is added — this doesn't exist today. Filter presets are Today / This Week / This Month / Custom range, defaulting to All Time. Search matches Member name/phone-suffix and transaction description only, not amount.
- Full transaction history is shown inline, most-recent-first, with infinite scroll — this screen becomes the Pool's complete ledger view. The standalone "View Ledger" button is removed as redundant.
- The existing Deposit button and non-organizer "Vote to refund" link are kept (the wireframe simply omitted them; that wasn't an intentional removal).
- **Lock Pool** and **Close Pool & Refund** move from the "⋯" `OrganizerControlsSheet` menu to direct, organizer-only buttons on this screen, with the same conditional visibility as today (Lock hides once `LOCKED`, both hide once `CLOSED`). The sheet keeps its other five actions: Transfer out, Reimburse a Member, Add Members (Equal Split only), Manage Members, Invitations (Custom Split only).

### 2. All Members (`mobile/src/screens/MembersScreen.tsx`, redesign)

- No Deposited/Pending status pill, for any Pool type. There is no per-Member deposit-status field in the data model to back one.
- No "Send Request" button (present in the wireframe, confirmed to do nothing).
- No swipe-to-delete gesture. No gesture library (`react-native-gesture-handler` or similar) exists anywhere in this app today; the existing tap-"Remove"-then-`Alert.alert`-confirm pattern is kept instead of introducing one.
- Trailing text per row stays role (Organizer/Member), unchanged.
- Tapping a row (not Remove) navigates to that Member's User Detail screen.
- Screen stays visible to every Pool Member, not organizer-only — consistent with full ledger transparency ([0008](./0008-full-ledger-transparency.md)).

### 3. User Detail (new screen)

- Header: placeholder avatar (no initials — see the identity note in Considered Options), with both "name" and "PoolPay Unique ID" shown as the existing `···1234` phone-suffix label. There is no real name/profile system yet.
- History list: this Member's own Deposits, Reimbursements, and Refunds, filtered from the Pool's ledger by counterparty. Spends are excluded — a Spend isn't attributable to one Member's history (see Transaction Detail below).
- Tapping a row navigates to Transaction Detail, same as Pool Detail's list.
- **Delete User is organizer-only and unconditional.** The wireframe's annotation implied deletion should require reimbursing the Member first. This directly conflicts with [ADR-0006](./0006-pool-closure-and-refund.md), which already considered and rejected instant refund-on-removal: a removed Member's Deposits stay in the Pool and are returned pro-rata at Closure like everyone else's. **ADR-0006 stands unchanged — this redesign does not reopen it.** `removeMember` (`server/src/memberships/membership-service.ts`) keeps its existing rule set (organizer-only, blocked once `CLOSED`, can't target the organizer) with no new reimbursement precondition added.
- Viewable by any Pool Member; only the organizer sees the Delete button, matching `removeMember`'s existing permission rules.

### 4. Transaction Detail (new screen)

- One unified screen for any transaction row tap — Deposit, Reimbursement, Refund, or Spend — from either Pool Detail's list or User Detail's list. Both use the same row component and open this same screen.
- No avatar. Fields: who (the actor/counterparty, tappable, navigates to their User Detail — for Spend this is currently always the organizer, since only they can Transfer Out), date, amount, description (`merchantRef` for Spend, the corresponding field for the others).
- No nested history — a single-transaction view, not an aggregation.
- **Backend gap:** `Spend.userId` (the Transfer-out actor) already exists on `server/prisma/schema.prisma` and is persisted, but `LedgerService.getLedger` (`server/src/ledger/ledger-service.ts`) currently maps a `SPEND` entry's `counterparty` to `merchantRef`, not `userId` — so the actor isn't exposed today. `LedgerEntry` (`server/src/ledger/types.ts`) needs a new field carrying the Spend's actor so Transaction Detail can show and link to them.

### 5. Shared work across all four screens

- New shared RN components — `Avatar`, `ListRow`, `Pill` — matching the visual language already defined, but not yet componentized, in `docs/design/poolpay-ui-kit.html` / `docs/design/README.md`. Every existing screen currently hand-rolls its own inline styles for these; this redesign is the first place three-plus screens share the same row/avatar/pill pattern, which is why building shared components is worth it now rather than a broader component-library effort.
- The ledger needs real date-range filtering, text search, and pagination/infinite-scroll support server-side — the current endpoint returns a flat, unfiltered, unpaginated pool-scoped list.

## Considered Options

- **Reimbursement-required-before-delete** (from the wireframe). Rejected — contradicts ADR-0006's pro-rata-at-Closure rule, which stands unchanged. Reopening ADR-0006 would require solving the same "this one Member's fair share right now, while the Pool stays open for everyone else" problem ADR-0006 already rejected, for no new benefit.
- **Real user names / profile system.** Deferred to a future ticket. The phone-suffix identity scheme (`···1234`) stays for both "name" and "PoolPay Unique ID" on User Detail.
- **Real iOS-style swipe-to-delete on All Members.** Rejected in favor of the existing tap + `Alert.alert` pattern — no gesture library exists in the app, and introducing one for a single screen isn't worth it here.
- **A bulk "nudge all pending members to pay" feature**, one plausible reading of the wireframe's "Send Request" button. Rejected along with the button itself and the Deposited/Pending status concept it depended on, which has no backing data model field.

## Consequences

- `LedgerScreen.tsx` may become fully dead code once Pool Detail's inline history supersedes it — check during implementation and remove if so.
- `OrganizerControlsSheet.tsx` drops from 7 actions to 5 (Lock Pool and Close Pool & Refund move out), and needs its own conditional-visibility logic (today driven by `pool.state`) reconciled with the same buttons appearing directly on Pool Detail.
- `LedgerEntry`/`LedgerService.getLedger` gain a field for the Spend actor, exposing `Spend.userId` through the ledger API for the first time.
- The ledger API surface grows real filtering, search, and pagination — currently absent — which User Detail, Pool Detail, and any future ledger consumer will share.
- Two new mobile screens (`UserDetailScreen`, `TransactionDetailScreen`) and three new shared components (`Avatar`, `ListRow`, `Pill`) are net-new build, not redesigns of existing files.
