import "dotenv/config";
import { env, hasDecentroCredentials } from "./lib/env.js";
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
import { DepositService } from "./deposits/deposit-service.js";
import { PrismaDepositRepository } from "./deposits/prisma-deposit-repository.js";
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
import { FakePaymentProvider } from "./payments/fakes/fake-payment-provider.js";
import { DecentroPaymentProvider } from "./payments/decentro/decentro-payment-provider.js";
import { FakeIdentityProvider } from "./auth/fakes/fake-identity-provider.js";
import { DecentroIdentityProvider } from "./auth/decentro-identity-provider.js";

const userRepository = new PrismaUserRepository(prisma);

// Real BaaS/UPI partner (ticket #14, Decentro) — falls back to the fakes
// used by every other ticket's tests when credentials aren't configured, so
// the app stays runnable without a live Decentro account. See lib/env.ts.
const identityProvider = hasDecentroCredentials
  ? new DecentroIdentityProvider({
      clientId: env.DECENTRO_CLIENT_ID!,
      clientSecret: env.DECENTRO_CLIENT_SECRET!,
      env: env.DECENTRO_ENV,
    })
  : new FakeIdentityProvider();

const authService = new AuthService({
  userRepository,
  otpStore: new PrismaOtpStore(prisma),
  otpSender: new ConsoleOtpSender(),
  identityProvider,
});

const poolRepository = new PrismaPoolRepository(prisma);
const membershipRepository = new PrismaMembershipRepository(prisma);
const depositRepository = new PrismaDepositRepository(prisma);
const spendRepository = new PrismaSpendRepository(prisma);
const reimbursementRepository = new PrismaReimbursementRepository(prisma);
const refundRepository = new PrismaRefundRepository(prisma);
const refundVoteRepository = new PrismaRefundVoteRepository(prisma);
const paymentProvider = hasDecentroCredentials
  ? new DecentroPaymentProvider({
      clientId: env.DECENTRO_CLIENT_ID!,
      clientSecret: env.DECENTRO_CLIENT_SECRET!,
      env: env.DECENTRO_ENV,
      consumerUrn: env.DECENTRO_CONSUMER_URN!,
      virtualVpa: env.DECENTRO_VIRTUAL_VPA!,
    })
  : new FakePaymentProvider();

const poolService = new PoolService({ poolRepository, membershipRepository, userRepository });
const membershipService = new MembershipService({ poolRepository, membershipRepository });
const depositService = new DepositService({
  poolRepository,
  membershipRepository,
  depositRepository,
  spendRepository,
  reimbursementRepository,
  refundRepository,
  paymentProvider,
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
  paymentProvider,
});
const voteService = new VoteService({
  poolRepository,
  membershipRepository,
  refundVoteRepository,
  closureService,
});
const analyticsService = new AnalyticsService({ userRepository, poolRepository, spendRepository });

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
  jwtSecret: env.JWT_SECRET,
});

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`pool-pay-server listening on :${port}`);
});
