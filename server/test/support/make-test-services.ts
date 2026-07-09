import { PoolService } from "../../src/pools/pool-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { DepositService } from "../../src/deposits/deposit-service.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";

// Shared across test files that just need working Pool/Membership/Deposit
// services and don't care about their internals — avoids re-wiring the same
// fakes everywhere. All services share the same repository instances, since
// e.g. a Pool created via poolService must be findable by the others.
export function makeTestServices() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const paymentProvider = new FakePaymentProvider();

  const poolService = new PoolService({ poolRepository, membershipRepository });
  const membershipService = new MembershipService({ poolRepository, membershipRepository });
  const depositService = new DepositService({
    poolRepository,
    membershipRepository,
    depositRepository,
    paymentProvider,
  });

  return {
    poolService,
    membershipService,
    depositService,
    poolRepository,
    membershipRepository,
    depositRepository,
    paymentProvider,
  };
}
