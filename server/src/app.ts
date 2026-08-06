import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AuthService } from "./auth/auth-service.js";
import { createAuthRouter } from "./auth/router.js";
import type { PoolService } from "./pools/pool-service.js";
import type { MembershipService } from "./memberships/membership-service.js";
import { createPoolsRouter } from "./pools/router.js";
import type { DepositService } from "./deposits/deposit-service.js";
import { createDepositsRouter } from "./deposits/router.js";
import { createDepositWebhookRouter } from "./deposits/webhook-router.js";
import type { PaymentProvider } from "./payments/types.js";
import type { SpendService } from "./spends/spend-service.js";
import { createSpendsRouter } from "./spends/router.js";
import type { ReimbursementService } from "./reimbursements/reimbursement-service.js";
import { createReimbursementsRouter } from "./reimbursements/router.js";
import type { LedgerService } from "./ledger/ledger-service.js";
import { createLedgerRouter } from "./ledger/router.js";
import type { ClosureService } from "./closure/closure-service.js";
import { createClosureRouter } from "./closure/router.js";
import type { VoteService } from "./votes/vote-service.js";
import { createVotesRouter } from "./votes/router.js";
import type { AnalyticsService } from "./analytics/analytics-service.js";
import { createAnalyticsRouter } from "./analytics/router.js";
import type { NotificationService } from "./notifications/notification-service.js";
import { createNotificationsRouter } from "./notifications/router.js";
import type { ActivityService } from "./activity/activity-service.js";
import { createActivityRouter } from "./activity/router.js";

export interface AppDependencies {
  authService: AuthService;
  poolService: PoolService;
  membershipService: MembershipService;
  depositService: DepositService;
  spendService: SpendService;
  reimbursementService: ReimbursementService;
  ledgerService: LedgerService;
  closureService: ClosureService;
  voteService: VoteService;
  analyticsService: AnalyticsService;
  notificationService: NotificationService;
  activityService: ActivityService;
  jwtSecret: string;
  // Deposit-confirmation webhook (ticket #15) — optional so every other
  // test file's createApp call is unaffected; only mounted when provided.
  paymentProvider?: PaymentProvider;
}

export function createApp({
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
  jwtSecret,
  paymentProvider,
}: AppDependencies): Express {
  const app = express();
  // The verify callback stashes the raw request bytes on req.rawBody — the
  // deposit webhook needs the exact bytes Cashfree signed for HMAC signature
  // verification (see createDepositWebhookRouter); a re-serialized copy of
  // the parsed JSON wouldn't reliably match.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use("/auth", createAuthRouter(authService, jwtSecret));
  app.use("/pools", createPoolsRouter(poolService, membershipService, jwtSecret));
  app.use("/pools", createDepositsRouter(depositService, jwtSecret));
  app.use("/pools", createSpendsRouter(spendService, jwtSecret));
  app.use("/pools", createReimbursementsRouter(reimbursementService, jwtSecret));
  app.use("/pools", createLedgerRouter(ledgerService, jwtSecret));
  app.use("/pools", createClosureRouter(closureService, jwtSecret));
  app.use("/pools", createVotesRouter(voteService, jwtSecret));
  app.use("/analytics", createAnalyticsRouter(analyticsService, jwtSecret));
  app.use("/notifications", createNotificationsRouter(notificationService, jwtSecret));
  app.use("/activity", createActivityRouter(activityService, jwtSecret));
  if (paymentProvider) {
    app.use("/webhooks", createDepositWebhookRouter(depositService, paymentProvider));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
