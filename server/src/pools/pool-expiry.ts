import type { InvitationRepository } from "../invitations/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import type { Pool, PoolRepository } from "./types.js";

export interface PoolExpiryRepositories {
  poolRepository: PoolRepository;
  invitationRepository: InvitationRepository;
  membershipRepository: MembershipRepository;
}

// Lazy expiry (ADR-0017) — there is no background sweep, same as
// OtpRequest.expiresAt (auth-service.ts): a lapsed Organizer self-Invitation
// is only discovered, and only persisted as EXPIRED, the next time something
// actually touches this Pool (a Deposit attempt, an invite/join attempt).
// A no-op once the Organizer has a Membership, since that's the single
// source of truth for "already paid" — nothing left to expire.
export async function expireIfLapsed(
  repositories: PoolExpiryRepositories,
  pool: Pool,
  now: () => Date = () => new Date(),
): Promise<Pool> {
  if (pool.state !== "ACTIVE") {
    return pool;
  }
  const organizerMembership = await repositories.membershipRepository.find(pool.id, pool.organizerId);
  if (organizerMembership) {
    return pool;
  }
  const invitation = await repositories.invitationRepository.findPendingByPoolAndInvitee(
    pool.id,
    pool.organizerId,
  );
  if (!invitation || invitation.expiresAt.getTime() > now().getTime()) {
    return pool;
  }
  await repositories.invitationRepository.markExpired(invitation.id);
  return repositories.poolRepository.updateState(pool.id, "EXPIRED");
}
