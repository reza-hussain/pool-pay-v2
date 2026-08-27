# Organizer transfer, scoped to admin/lifecycle authority only

New capability: the current Organizer can hand off the Organizer role to another Member, unilaterally picking their successor (no vote) — so a Pool survives its Organizer leaving.

This was originally motivated by "who spends the Pool's money if the Organizer leaves," back when the Organizer held sole spend authority ([ADR-0004](0004-single-organizer-authority.md)). That motivation is gone: [ADR-0018](0018-per-member-spend-authority-and-approval-threshold.md) gives every Member independent spend authority, so payments continue with no Organizer present at all.

What still requires transfer: the Organizer-only *administrative* powers — inviting new Members, removing a Member, Locking the Pool, and Closing the Pool. If the Organizer leaves without transferring, nobody can exercise any of these: the Pool can't admit a late joiner, can't remove a bad actor, can't be Locked to stop further spending, and can't be Closed except via the emergency majority vote ([ADR-0009](0009-majority-vote-emergency-refund.md)). We rejected relying solely on that emergency vote as the only way out of an Organizer-less Pool — it leaves "destroy the Pool" as the sole remaining action, disproportionate to smaller admin needs like removing one problem Member or Locking further contributions.

The outgoing Organizer picks their successor directly, with no vote required — consistent with ADR-0004's original single-trusted-person philosophy for administrative matters, even though spend authority itself is no longer concentrated this way.
