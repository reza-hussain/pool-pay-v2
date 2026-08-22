# Pool Pay

A custodial shared-payments app: groups of users deposit real money into a shared, time-boxed fund and spend from it together — for trips, events, or ongoing apartment/roommate expenses.

## Language

**Pool**:
A shared fund that a group of Members deposit money into and spend from together, for a bounded purpose (a trip, an event) or an ongoing purpose (an apartment). Holds real custodied money, not just a tracked balance.
_Avoid_: Mini-bank, pot, fund, jar

**Organizer**:
The Member who created a Pool and holds sole authority to spend or transfer money out of it. Exactly one per Pool in v1.
_Avoid_: Admin, owner (of the Pool itself — the Pool is not owned, it's organized)

**Member**:
A person who has joined a Pool and can contribute to it. Distinct from the Organizer, who is also a Member but with additional spending authority.
_Avoid_: User (too generic — "Member" is scoped to a specific Pool)

**Onboarding**:
The one-time, mandatory flow a person completes before reaching Home: phone/OTP verification, then profile setup (name, email, date of birth, Registered UPI ID, optional photo). Someone who already has a session never sees it again. The mobile client blocks every Pool-related screen (joining, depositing, etc.) until Onboarding — including the Registered UPI ID — is complete, so a Member the server processes is expected to always have a Registered UPI ID on file. Code should treat a Member missing one as an error condition, not a case to silently degrade around.
_Avoid_: Signup (too narrow — Signup is only the phone/OTP step within Onboarding)

**Invite Link / Pool Code**:
The two ways a person joins a Pool as a Member: an open shareable link, or a six-digit code entered manually. Joining is open (no Organizer approval step) since it doesn't move money on its own.
_Avoid_: Invite code (ambiguous between the two mechanisms — use the full term)

**Equal Split Pool**:
A Pool where the Organizer sets a fixed per-person contribution amount, and every Member is expected to contribute exactly that share.
_Avoid_: Fixed pool

**Open Pool**:
A Pool with no fixed contribution amount — Members contribute whatever they want, whenever they want. The Pool balance is simply the running sum of contributions. Retired (ticket #59): no longer offered on the create-Pool screen, and an existing Open Pool no longer accepts new Deposits — it stays fully readable and can still be Closed for its pro-rata refund. Equal Split Pool (with repeat Deposits) is the fit for the ongoing/recurring use case Open Pool used to serve.
_Avoid_: Flexible pool, ongoing pool

**Locked** (Pool state):
A Pool state, set only by the Organizer, in which no Member (including the Organizer) can make further deposits. Applies to both Equal Split and Open Pools. Lets an Organizer fully fund a Pool alone and shut out further contributions, or simply stop collection once a Pool has enough.
_Avoid_: Closed (reserved for the Pool's end-of-life state, a separate concept)

**Deposit**:
Money a Member pays into a Pool via UPI, by scanning the Pool's QR code. For an Equal Split Pool, the QR carries a fixed, locked amount equal to the Member's required share. For an Open Pool, the QR carries no amount and the Member enters whatever they want.
_Avoid_: Contribution (used loosely elsewhere in this doc before this term was sharpened — treat as synonym, but prefer "Deposit" going forward), payment-in

**Registered UPI ID**:
The UPI ID a person provides once, during Onboarding, stored on their account as the default destination for money leaving a Pool to them — refunds and reimbursements. Distinct from whatever UPI ID or app a Member happens to pay *from* when making a Deposit, which Pool Pay never captures or stores.
_Avoid_: VPA (the underlying technical identifier; use "Registered UPI ID" for the stored-on-account concept)

**Closed** (Pool state):
The Pool's end-of-life state, set only by the Organizer (no automatic expiry by date). On closing, any leftover balance is refunded pro-rata to Members via UPI, proportional to each Member's total contributions.
_Avoid_: Locked (a separate, earlier state — a Pool can be Locked without being Closed)
