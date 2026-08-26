import "dotenv/config";
import { env, hasCashfreeIdentityCredentials, hasCashfreePaymentCredentials } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { PrismaUserRepository } from "./auth/prisma-user-repository.js";
import { PrismaOtpStore } from "./auth/prisma-otp-store.js";
import { ConsoleOtpSender } from "./auth/console-otp-sender.js";
import { PoolService } from "./pools/pool-service.js";
import { PrismaPoolRepository } from "./pools/prisma-pool-repository.js";
import { MembershipService } from "./memberships/membership-service.js";
import { PrismaMembershipRepository } from "./memberships/prisma-membership-repository.js";
import { PrismaInvitationRepository } from "./invitations/prisma-invitation-repository.js";
import { InvitationService } from "./invitations/invitation-service.js";
import { PrismaJoinRequestRepository } from "./join-requests/prisma-join-request-repository.js";
import { JoinRequestService } from "./join-requests/join-request-service.js";
import { DepositService } from "./deposits/deposit-service.js";
import { PrismaDepositRepository } from "./deposits/prisma-deposit-repository.js";
import { PrismaPendingDepositRepository } from "./deposits/prisma-pending-deposit-repository.js";
import { SpendService } from "./spends/spend-service.js";
import { PrismaSpendRepository } from "./spends/prisma-spend-repository.js";
import { ReimbursementService } from "./reimbursements/reimbursement-service.js";
import { PrismaReimbursementRepository } from "./reimbursements/prisma-reimbursement-repository.js";
import { LedgerService } from "./ledger/ledger-service.js";
import { ClosureService } from "./closure/closure-service.js";
import { PrismaRefundRepository } from "./closure/prisma-refund-repository.js";
import { VoteService } from "./votes/vote-service.js";
import { PrismaRefundVoteRepository } from "./votes/prisma-refund-vote-repository.js";
import { AnalyticsService } from "./analytics/analytics-service.js";
import { NotificationService } from "./notifications/notification-service.js";
import { PrismaNotificationRepository } from "./notifications/prisma-notification-repository.js";
import { ActivityService } from "./activity/activity-service.js";
import { FakePaymentProvider } from "./payments/fakes/fake-payment-provider.js";
import { CashfreePaymentProvider } from "./payments/cashfree/cashfree-payment-provider.js";
import { FakeIdentityProvider } from "./auth/fakes/fake-identity-provider.js";
import { CashfreeIdentityProvider } from "./auth/cashfree-identity-provider.js";

const userRepository = new PrismaUserRepository(prisma);

// Real BaaS/UPI partner (ADR 0002/0005/0013, Cashfree) — falls back to the
// fakes used by every other ticket's tests when credentials aren't
// configured, so the app stays runnable without a live Cashfree account. See
// lib/env.ts.
const identityProvider = hasCashfreeIdentityCredentials
  ? new CashfreeIdentityProvider({
      clientId: env.CASHFREE_VERIFICATION_CLIENT_ID!,
      clientSecret: env.CASHFREE_VERIFICATION_CLIENT_SECRET!,
      env: env.CASHFREE_ENV,
      publicKey: env.CASHFREE_VERIFICATION_PUBLIC_KEY,
    })
  : new FakeIdentityProvider();

const paymentProvider = hasCashfreePaymentCredentials
  ? new CashfreePaymentProvider({
      env: env.CASHFREE_ENV,
      pg: { clientId: env.CASHFREE_PG_CLIENT_ID!, clientSecret: env.CASHFREE_PG_CLIENT_SECRET! },
      payout: { clientId: env.CASHFREE_PAYOUT_CLIENT_ID!, clientSecret: env.CASHFREE_PAYOUT_CLIENT_SECRET! },
      verification: {
        clientId: env.CASHFREE_VERIFICATION_CLIENT_ID!,
        clientSecret: env.CASHFREE_VERIFICATION_CLIENT_SECRET!,
        publicKey: env.CASHFREE_VERIFICATION_PUBLIC_KEY,
      },
      virtualVpa: env.CASHFREE_VIRTUAL_VPA!,
    })
  : new FakePaymentProvider();

const authService = new AuthService({
  userRepository,
  otpStore: new PrismaOtpStore(prisma),
  otpSender: new ConsoleOtpSender(),
  identityProvider,
  paymentProvider,
});

const poolRepository = new PrismaPoolRepository(prisma);
const membershipRepository = new PrismaMembershipRepository(prisma);
const invitationRepository = new PrismaInvitationRepository(prisma);
const joinRequestRepository = new PrismaJoinRequestRepository(prisma);
const depositRepository = new PrismaDepositRepository(prisma);
const pendingDepositRepository = new PrismaPendingDepositRepository(prisma);
const spendRepository = new PrismaSpendRepository(prisma);
const reimbursementRepository = new PrismaReimbursementRepository(prisma);
const refundRepository = new PrismaRefundRepository(prisma);
const refundVoteRepository = new PrismaRefundVoteRepository(prisma);
const notificationRepository = new PrismaNotificationRepository(prisma);

const notificationService = new NotificationService({ notificationRepository });
const poolService = new PoolService({
  poolRepository,
  membershipRepository,
  userRepository,
  notificationService,
  invitationRepository,
});
const joinRequestService = new JoinRequestService({
  joinRequestRepository,
  membershipRepository,
  poolRepository,
  userRepository,
  notificationService,
});
const membershipService = new MembershipService({
  poolRepository,
  membershipRepository,
  invitationRepository,
  joinRequestService,
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
  depositRepository,
  spendRepository,
  reimbursementRepository,
  refundRepository,
  userRepository,
  paymentProvider,
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
  reimbursementRepository,
  refundRepository,
});
const closureService = new ClosureService({
  poolRepository,
  depositRepository,
  spendRepository,
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

const app = createApp({
  authService,
  poolService,
  membershipService,
  depositService,
  spendService,
  reimbursementService,
  ledgerService,
  closureService,
  voteService,
  analyticsService,
  notificationService,
  activityService,
  invitationService,
  joinRequestService,
  jwtSecret: env.JWT_SECRET,
  paymentProvider,
});

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`pool-pay-server listening on :${port}`);
});
