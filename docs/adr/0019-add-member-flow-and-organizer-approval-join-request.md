# Add Member flow redesign; Organizer approval gate for open-link/code joins

Reached via a `/grilling` session over a feature idea sketched against WhatsApp's own
"Add members" and "Group link" screens (layout references only, not specs to clone). All
decisions below were confirmed one-by-one during that session.

Scope: **Equal Split Pools only.** Custom Split's targeted, amount-carrying `Invitation` flow
(ADR-0016, ADR-0017) is untouched by this ADR — its pay-to-join model has no room for a separate
approval step, and it already has an equivalent to "organizer approval": the organizer choosing
who to invite in the first place.

## Decision

### 1. One Add Member screen, three existing entry points converge on it

A new **Add Member** screen replaces `InviteScreen.tsx` (6-digit code + "Share invite link" +
Done) everywhere it's reachable: the new "+" on All Members (`MembersScreen.tsx`) that this ADR
adds, Pool Detail's avatar-strip "+" (#81), and the Organizer Controls sheet's "Add Members" row
(ADR-0018). `InviteScreen.tsx` is retired.

The screen offers three actions — phone number entry, choose from device contacts, share QR or
link — deliberately dropping WhatsApp's "New contact" row (screenshot reference 3), which has no
Pool Pay equivalent.

### 2. Two join methods, two different gates

These two actions on the Add Member screen are not variations of one flow — they're different
mechanisms with different consent models:

- **Organizer picks a phone number or contact.** This reuses the existing `Invitation` shape
  (`server/prisma/schema.prisma:81-104`) that Custom Split already uses, but with
  `assignedAmountPaise` absent/nullable — Equal Split has no per-invitee assigned amount, only a
  computed `perPersonAmountPaise`. The invitee must still explicitly accept (same deep-link/
  accept flow Custom Split already has via `InvitationDetailRoute`) before a `Membership` is
  created — every join path in this app already requires the joining person to take some action,
  and a silent, invitee-consent-free add would be a new, lower bar. Accepting creates the
  `Membership` immediately at zero cost (no payment gate on accept — Equal Split Members deposit
  independently, whenever, after joining). **No Organizer-approval gate applies to this path** —
  the Organizer choosing this specific person by phone/contact *is* the approval.
- **Share QR or link** (screenshot reference 4's layout, minus its per-channel buttons — see
  §6). This is the path the rest of this ADR is about.

### 3. `JoinRequest`: a new entity, not a `Membership` status

Today, `Membership` (`schema.prisma:209-226`) has no status field — every consumer
(`listByPool` for All Members, the Equal Split per-person denominator, ledger/pay-eligibility
checks) treats "an un-removed `Membership` row exists" as the total, sole definition of "is a
real participant," and that invariant is already relied on by ADR-0016/0017's payment gate.

Rather than bolt a status onto `Membership` — which would force every existing call site to
remember to filter it — joining via the open code/link now goes through a new `JoinRequest`
entity, mirroring how `Invitation` already models a different pre-`Membership` state:

- States: `PENDING` → `APPROVED` / `REJECTED` (approving atomically creates the `Membership`,
  the same shape as paying an `Invitation` does today).
- **Applies uniformly to the underlying join mechanism**, not to a specific screen. Typed
  6-digit code, scanned QR, and clicked link are three transports of the identical
  `pool.joinCode` — there's no way to distinguish them server-side, and no reason to trust one
  transport more than another. `MembershipService.join()` (`membership-service.ts:75-105`) now
  always creates a `JoinRequest` for Equal Split instead of an immediate `Membership`.
- **Expires 24 hours after creation if the Organizer doesn't act** — lazy, no cron, same
  no-sweep pattern as `OtpRequest.expiresAt` and the self-`Invitation` expiry (ADR-0017).
- An **expired** `JoinRequest` allows a fresh retry (re-scanning/re-entering the code creates a
  new `PENDING` request) — no real rejection happened, the Organizer was just slow, same spirit
  as `Membership.create()` already reactivating a removed row rather than erroring.
- A **declined** `JoinRequest` does not allow silent re-request via the same code/link — decline
  is an explicit Organizer signal. The Organizer can still override it via the explicit
  phone/contact-add path (§2), which bypasses this gate entirely.
- While `PENDING`, the requester sees no pool-specific view at all — just a lightweight "request
  sent, waiting for approval" confirmation. They are not a Member, so ADR-0008's full-ledger-
  transparency guarantee doesn't apply to them, and there's no partial/preview pool state to
  design or maintain.

### 4. Organizer-side approval UX

- A new **"Pending requests" section** on the All Members screen, above the existing Member
  list, with Approve/Decline row actions (reusing `ListRow`/`Pill` per the design kit, and the
  existing tap-then-`Alert.alert`-confirm pattern — no gesture library exists in this app).
  **Hidden entirely from non-Organizer Members** — unlike ledger/member data (covered by
  ADR-0008), a list of outsiders asking to join isn't Pool activity subject to that transparency
  guarantee; it's Organizer business, closer to the Organizer-only Lock/Close buttons than to the
  visible-to-everyone Member list.
- A new `JOIN_REQUEST_RECEIVED` **Notification** type, reusing the existing `Notification` model
  (`schema.prisma:231-244`, the Alerts tab from ticket #23) and its per-recipient fan-out — no
  new alerting mechanism. Deep-links into All Members.
- **Approval sends the requester a notification; decline does not.** A silent decline avoids
  needing rejection copy and matches how request/approval UX elsewhere (including WhatsApp's own
  group-join-request flow) tends to skip an explicit "you were rejected" push.

### 5. Join code/link gets an organizer-chosen expiry

`Pool` gains a nullable `expiresAt` alongside its existing `joinCode` (`schema.prisma:62`),
editable from the share screen (a preset picklist, matching the existing
`InviteByPhoneScreen.tsx` `EXPIRY_PRESETS` chip pattern already used for Custom Split
Invitations). Defaults to `null` (no expiry) at Pool creation, so nothing changes for existing
Pools or Organizers who never touch the new share screen. One code, one expiry — governs typed
entry, QR, and link uniformly, consistent with §3's "one mechanism, three transports" model.
Checked lazily at join time, same no-cron pattern as everything else here.

Considered and rejected: minting a distinct, separately-expiring token per share event (closer
to some apps' multi-link invite systems). Rejected as a materially bigger build — a new table,
multiple live tokens per Pool, per-token revocation — for a capability not asked for.

### 6. Share screen mechanics

The share screen (reached from "share QR or link") shows Copy link, Show QR, and a single
"Share link" action backed by React Native's native `Share.share()` — already used by the
retired `InviteScreen.tsx` — rather than hardcoded per-channel buttons (WhatsApp's own reference
screenshot shows explicit "Send via WhatsApp/status/SMS/email" rows). The OS share sheet already
surfaces every installed channel generically; hardcoding channels means maintaining deep links to
each one for no benefit, and a single primary action fits the design kit's "one pumpkin action
per screen" rule better than several competing buttons.

## Considered Options

- **Configurable per-pool approval toggle** (WhatsApp's "Manage permissions," shown off by
  default in the reference screenshot). Rejected — the ask was unconditional ("the organizer
  must approve... unless approved, they cannot pay"), and a toggle is cheap to add later if a
  real need for opt-out shows up; building it speculatively now is not.
- **Extending this to Custom Split.** Rejected — Custom Split's pay-to-join model has no window
  for a separate approval step, and its targeted `Invitation` already encodes organizer intent
  per-invitee.
- **`Membership` gains a status field** instead of a new `JoinRequest` entity. Rejected — would
  require every existing consumer of "does a `Membership` row exist" (All Members, the Equal
  Split denominator, ledger/pay-eligibility) to learn to filter by status, risking a missed call
  site silently granting pending-joiner access.
- **Instant, invitee-consent-free `Membership` creation** when the Organizer picks a phone
  number. Rejected — every existing join path (code entry, link, paying an Invitation) already
  requires the joining person to take some action; this would be the only exception.
- **Building the full cold-start deep-link funnel now** (App Store redirect when the app isn't
  installed; resuming a pending join through signup/onboarding when installed but logged out).
  Rejected as out of scope for this ADR — see Consequences. This is materially different work
  (hosted web fallback / App Links config or a third-party deferred-deep-linking SDK, plus
  link-persistence through the login/signup flow) from the approval-gate model this ADR designs,
  and was already explicitly deferred once before (ticket #61,
  `App.tsx:727-729`: *"If the app is opened by a link before login, the link is dropped —
  completing a deferred join/invitation after signup is out of scope for this ticket"*).
- **Per-channel share buttons** (§6) and **showing Pending requests to non-Organizer Members**
  (§4). Both rejected for the reasons stated in their sections above.

## Consequences

- **New `JoinRequest` model**: `id`, `poolId`, `requesterUserId`, `state`
  (`PENDING`/`APPROVED`/`REJECTED`), `createdAt`, `expiresAt` (created-at + 24h). Approving
  atomically creates a `Membership`, same transaction shape as paying an `Invitation`.
- **`Pool` gains a nullable `expiresAt`** governing its existing `joinCode`, defaulting to `null`.
- **`Invitation.assignedAmountPaise`** (`schema.prisma:89`) becomes nullable, or gains an
  Equal-Split-shaped sibling path — needs a concrete schema decision during implementation, since
  it's currently a required field written only by Custom Split's phone-invite flow
  (`InviteByPhoneScreen.tsx`).
- **`Notification.type`** (`schema.prisma:237`, currently a bare string documented in a comment
  as `"DEPOSIT_RECEIVED" | "POOL_FULLY_FUNDED" | "POOL_LOCKED" | "REFUND_PROCESSED"`) gains
  `"JOIN_REQUEST_RECEIVED"`.
- **`MembershipService.join()`** (`membership-service.ts:75-105`) changes for Equal Split: it no
  longer returns an immediate `Membership` for a code/link/manual-entry join — it creates a
  `JoinRequest` instead. `joinByCode`/`joinByPoolId`'s callers and the mobile client both need to
  handle this new pending outcome distinctly from success.
- **`InviteScreen.tsx` is retired**, replaced by the new Add Member + Share screens across all
  three entry points.
- **New mobile screens**: Add Member, Share QR/Link (with the expiry picklist), and the Pending
  Requests section within `MembersScreen.tsx`. New server endpoints for creating/listing/
  approving/declining `JoinRequest`s, and for setting the Pool's `joinCode` `expiresAt`.
- **Follow-on gap, explicitly not built here**: the full cold-start funnel — redirecting to the
  App Store when the app isn't installed, and resuming a pending join through signup/onboarding
  when it is but the person isn't logged in. Today's `poolpay://join/<poolId>` is a bare custom
  URL scheme (`mobile/src/lib/inviteLink.ts`), not a universal/App Link, and deep links opened
  while logged out are silently dropped (`App.tsx:727-742`). Closing this gap needs either a
  hosted web fallback with iOS Associated Domains/Android App Links, or a third-party
  deferred-deep-linking service, plus a link-persistence mechanism through the auth/onboarding
  flow — tracked as a separate future ticket, not designed here.
- **`CONTEXT.md` glossary updates** (done alongside this ADR): the **Invite Link / Pool Code**
  entry's "no Organizer approval step" is no longer accurate for Equal Split; the **Invitation**
  entry needs a note about its new Equal-Split, no-assigned-amount variant; a new **Join Request**
  entry is added.
