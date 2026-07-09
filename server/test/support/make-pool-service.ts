import { PoolService } from "../../src/pools/pool-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";

// Shared across test files that just need a working PoolService/MembershipService
// and don't care about their internals — avoids re-wiring the same fakes everywhere.
// poolService and membershipService share the same repository instances, since a
// Pool created via poolService must be findable by membershipService's joins.
export function makeTestPoolService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const poolService = new PoolService({ poolRepository, membershipRepository });
  const membershipService = new MembershipService({ poolRepository, membershipRepository });
  return { poolService, membershipService, poolRepository, membershipRepository };
}
