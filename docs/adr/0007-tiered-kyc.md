# Tiered KYC: full verification for Organizers only, light verification for Members

We considered requiring full KYC from every Member versus only the Organizer versus a tiered approach. We chose **tiered**: becoming an Organizer (who controls Pool spending and receives refunds-out) requires full KYC, matching what our BaaS/UPI partner will likely require for anyone custodying and directing pooled funds. Regular Members only need light verification (e.g. phone number) to join and deposit into a Pool.

This is workable because UPI itself already requires the *sender's own bank* to have KYC'd them before a payment can go through — Pool Pay re-verifying every casual Member who just wants to chip in for a dinner split would be redundant and would kill the casual, low-friction use case that's core to the product.
