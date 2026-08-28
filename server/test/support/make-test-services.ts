import { PoolService } from "../../src/pools/pool-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryInvitationRepository } from "../../src/invitations/fakes/in-memory-invitation-repository.js";
import { InvitationService } from "../../src/invitations/invitation-service.js";
import { DepositService } from "../../src/deposits/deposit-service.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryPendingDepositRepository } from "../../src/deposits/fakes/in-memory-pending-deposit-repository.js";
import { SpendService } from "../../src/spends/spend-service.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemorySpendAttributionRepository } from "../../src/spends/fakes/in-memory-spend-attribution-repository.js";
import { SpendApprovalService } from "../../src/spend-approvals/spend-approval-service.js";
import { InMemoryPendingSpendRepository } from "../../src/spend-approvals/fakes/in-memory-pending-spend-repository.js";
import { InMemorySpendApprovalRepository } from "../../src/spend-approvals/fakes/in-memory-spend-approval-repository.js";
import { ReimbursementService } from "../../src/reimbursements/reimbursement-service.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { LedgerService } from "../../src/ledger/ledger-service.js";
import { ClosureService } from "../../src/closure/closure-service.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { VoteService } from "../../src/votes/vote-service.js";
import { InMemoryRefundVoteRepository } from "../../src/votes/fakes/in-memory-refund-vote-repository.js";
import { InMemoryUserRepository } from "../../src/auth/fakes/in-memory-user-repository.js";
import type { UserRepository } from "../../src/auth/types.js";
import { AnalyticsService } from "../../src/analytics/analytics-service.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { NotificationService } from "../../src/notifications/notification-service.js";
import { InMemoryNotificationRepository } from "../../src/notifications/fakes/in-memory-notification-repository.js";
import { ActivityService } from "../../src/activity/activity-service.js";

// Shared across test files that just need working Pool/Membership/Deposit/Spend/
// Reimbursement/Ledger/Closure/Vote services and don't care about their
// internals — avoids re-wiring the same fakes everywhere. All services share
// the same repository instances, since e.g. a Pool created via poolService
// must be findable by others.
//
// Pass the same userRepository your AuthService uses if the test creates a
// Pool — PoolService.createPool now looks up the organizer's isVerified flag
// there (ticket #12), so a fabricated bearer-token userId needs a matching
// seeded User (see InMemoryUserRepository.seedVerifiedUser).
export function makeTestServices(options?: { userRepository?: UserRepository }) {
  const poolRepository = new InMemoryPoolRepository();
  const userRepository = options?.userRepository ?? new InMemoryUserRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const invitationRepository = new InMemoryInvitationRepository();
  const depositRepository = new InMemoryDepositRepository();
  const pendingDepositRepository = new InMemoryPendingDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const spendAttributionRepository = new InMemorySpendAttributionRepository();
  const pendingSpendRepository = new InMemoryPendingSpendRepository();
  const spendApprovalRepository = new InMemorySpendApprovalRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const refundVoteRepository = new InMemoryRefundVoteRepository();
  const paymentProvider = new FakePaymentProvider();
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService({ notificationRepository });

  const poolService = new PoolService({
    poolRepository,
    membershipRepository,
    userRepository,
    notificationService,
    invitationRepository,
  });
  const membershipService = new MembershipService({
    poolRepository,
    membershipRepository,
    invitationRepository,
    depositRepository,
    spendRepository,
    spendAttributionRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
  });
  const invitationService = new InvitationService({
    invitationRepository,
    poolRepository,
    membershipRepository,
    userRepository,
    notificationService,
  });
  const depositService = new DepositService({
    poolRepository,
    membershipRepository,
    depositRepository,
    pendingDepositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
    userRepository,
    notificationService,
    invitationRepository,
  });
  const spendService = new SpendService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    spendAttributionRepository,
    pendingSpendRepository,
    spendApprovalRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
  });
  const spendApprovalService = new SpendApprovalService({
    poolRepository,
    membershipRepository,
    pendingSpendRepository,
    spendApprovalRepository,
    spendService,
  });
  const reimbursementService = new ReimbursementService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
  });
  const ledgerService = new LedgerService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    spendAttributionRepository,
    reimbursementRepository,
    refundRepository,
  });
  const closureService = new ClosureService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    spendAttributionRepository,
    reimbursementRepository,
    refundRepository,
    userRepository,
    paymentProvider,
    notificationService,
  });
  const voteService = new VoteService({
    poolRepository,
    membershipRepository,
    refundVoteRepository,
    closureService,
  });
  const analyticsService = new AnalyticsService({ userRepository, poolRepository, spendRepository });
  const activityService = new ActivityService({
    membershipRepository,
    poolRepository,
    depositRepository,
    refundRepository,
    userRepository,
  });

  return {
    poolService,
    membershipService,
    invitationService,
    depositService,
    spendService,
    spendApprovalService,
    reimbursementService,
    ledgerService,
    closureService,
    voteService,
    analyticsService,
    notificationService,
    activityService,
    poolRepository,
    membershipRepository,
    invitationRepository,
    userRepository,
    depositRepository,
    pendingDepositRepository,
    spendRepository,
    spendAttributionRepository,
    pendingSpendRepository,
    spendApprovalRepository,
    reimbursementRepository,
    refundRepository,
    refundVoteRepository,
    notificationRepository,
    paymentProvider,
  };
}
