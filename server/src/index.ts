import "dotenv/config";
import { env } from "./lib/env.js";
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
import { FakePaymentProvider } from "./payments/fakes/fake-payment-provider.js";

const authService = new AuthService({
  userRepository: new PrismaUserRepository(prisma),
  otpStore: new PrismaOtpStore(prisma),
  otpSender: new ConsoleOtpSender(),
});

const poolRepository = new PrismaPoolRepository(prisma);
const membershipRepository = new PrismaMembershipRepository(prisma);
const depositRepository = new PrismaDepositRepository(prisma);
const spendRepository = new PrismaSpendRepository(prisma);
const reimbursementRepository = new PrismaReimbursementRepository(prisma);
// No real BaaS/UPI partner is wired up yet (see ADR 0002, ADR 0005, and
// docs/spec-mvp.md's Testing Decisions) — every deposit/spend/refund runs
// through this fake until a later ticket swaps in a real implementation
// behind the same PaymentProvider interface.
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

const app = createApp({
  authService,
  poolService,
  membershipService,
  depositService,
  spendService,
  reimbursementService,
  ledgerService,
  jwtSecret: env.JWT_SECRET,
});

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`pool-pay-server listening on :${port}`);
});
