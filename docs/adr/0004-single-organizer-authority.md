# Single-Organizer spending authority, no multisig/approval workflow

We considered several governance models for who can spend a Pool's money: single-organizer control, multisig-style approval thresholds, reimbursement-only with vote-approved claims, or a per-Pool configurable mode. We chose **single-Organizer control** for v1 — the Member who created the Pool has sole authority to spend or transfer money out of it, with no approval workflow from other Members.

This matches the informal mental model groups already use ("someone holds the shared cash") and avoids the complexity of coordinating approvals (thresholds, non-responsive voters, tie-breaking). It is a deliberate trust trade-off: Members must trust the Organizer completely with deposited money. We may add approval workflows later if trust proves to be a real problem for users, but v1 intentionally ships without one.
