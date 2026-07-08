# Manual Pool closure with pro-rata refund of leftover balance

Pools have no automatic expiry — a Pool closes only when the Organizer explicitly closes it, regardless of Pool type (Equal Split or Open) or any trip/event date. Auto-closing on a date was rejected: trip dates slip and Open Pools (e.g. apartment expenses) have no natural end date, so tying real-money closure to a calendar date is risky.

On closure, any leftover balance is refunded **pro-rata** to Members based on their total contributions to the Pool (not split evenly across current Members), paid out via UPI to each Member's linked VPA. This was chosen over an even split or a "must spend to zero" requirement because it's the fairest and most auditable rule, and avoids disputes ("I put in more than you, why do we get the same refund?").

This is distinct from the **Locked** state (see [CONTEXT.md](../../CONTEXT.md)), which only stops new deposits — a Pool can be Locked without being Closed.

A Member removed from a Pool before Closure is not instantly refunded — their Deposits stay in the Pool and are returned like everyone else's, pro-rata, at Closure. Instant refund-on-removal was considered and rejected: it's not hard on the payments side (same UPI payout rail), but it would require a second pro-rata calculation ("this one Member's fair share of what's left, right now, while the Pool stays open for everyone else") alongside the existing Closure-time calculation, for no clear benefit over just waiting until Closure.
