# Registered UPI ID captured at Onboarding, replacing the fake refund destination

We considered continuing to fake the refund destination (today's `${memberId}@fakebank` placeholder in `closure-service.ts`) or continuing to require an Organizer to type a UPI ID in by hand for every reimbursement, versus capturing a Registered UPI ID once during Onboarding and storing it on the person's account. We chose to capture and store it: refunds ([0006](./0006-pool-closure-and-refund.md)) and reimbursements now have a real, reusable destination instead of a placeholder or a value re-entered by someone else each time.

Onboarding also enforces a universal 18+ age gate from the collected date of birth, blocking account activation below that age. This applies to every person regardless of role, and is separate from the Organizer-only full KYC tier in [0007](./0007-tiered-kyc.md) — someone who never becomes an Organizer still clears the age gate but never undergoes full KYC.

## Consequences

- The account gains stored profile fields it didn't have before (name, email, date of birth, Registered UPI ID, optional photo); email is captured but not verified.
- `closure-service.ts`'s refund path and the reimbursement flow read the Member's Registered UPI ID instead of generating a fake VPA or accepting one typed in by the Organizer.
