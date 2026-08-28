// More than half of an eligible count — 3 eligible members need 2, 4 need 3,
// etc. Shared by VoteScreen (ADR-0009, non-Organizer Members) and
// SpendApprovalsScreen (ADR-0020, no Organizer exclusion) — what counts as
// "eligible" differs per caller, the majority arithmetic itself doesn't.
export function simpleMajority(eligibleCount: number): number {
  return Math.floor(eligibleCount / 2) + 1;
}
