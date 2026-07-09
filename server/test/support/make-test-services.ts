import { PoolService } from "../../src/pools/pool-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { DepositService } from "../../src/deposits/deposit-service.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { SpendService } from "../../src/spends/spend-service.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { ReimbursementService } from "../../src/reimbursements/reimbursement-service.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { LedgerService } from "../../src/ledger/ledger-service.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";

// Shared across test files that just need working Pool/Membership/Deposit/Spend/
// Reimbursement/Ledger services and don't care about their internals — avoids
// re-wiring the same fakes everywhere. All services share the same repository
// instances, since e.g. a Pool created via poolService must be findable by others.
export function makeTestServices() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const paymentProvider = new FakePaymentProvider();

  const poolService = new PoolService({ poolRepository, membershipRepository });
  const membershipService = new MembershipService({ poolRepository, membershipRepository });
  const depositService = new DepositService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    paymentProvider,
  });
  const spendService = new SpendService({
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    paymentProvider,
  });
  const reimbursementService = new ReimbursementService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    paymentProvider,
  });
  const ledgerService = new LedgerService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
  });

  return {
    poolService,
    membershipService,
    depositService,
    spendService,
    reimbursementService,
    ledgerService,
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    paymentProvider,
  };
}
